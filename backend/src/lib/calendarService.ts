import { prisma } from "./prisma";
import { buildClientHubEmailHtml } from "./notificationService";
import { getSmtpSettings, createTransporter } from "./emailService";

export interface CreateEventParams {
  accountId: string;
  createdById: string;
  title: string;
  description?: string;
  startTime: Date | string;
  endTime: Date | string;
  locationUrl?: string;
  clientId?: string;
  projectId?: string;
  attendees: Array<{
    email?: string;
    name?: string;
    userId?: string;
    isClient?: boolean;
  }>;
}

/**
 * Generates an RFC 5545 compliant .ics calendar invite string
 */
export function generateIcsInvite(options: {
  uid: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  location?: string | null;
  organizerName: string;
  organizerEmail: string;
  attendees: Array<{ email: string; name?: string | null }>;
}): string {
  const formatIcsDate = (d: Date) => {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };

  const dtStart = formatIcsDate(options.startTime);
  const dtEnd = formatIcsDate(options.endTime);
  const dtStamp = formatIcsDate(new Date());

  const attendeeLines = options.attendees
    .map(
      (a) =>
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${a.name || a.email}:mailto:${a.email}`
    )
    .join("\r\n");

  const descriptionParts = [
    options.description ? options.description.replace(/\n/g, "\\n") : "",
    options.location ? `Meeting / Google Meet Link: ${options.location}` : "",
  ].filter(Boolean);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ClientHub//Agency Operations//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${options.uid}@clienthub.local`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${options.title.replace(/\n/g, " ")}`,
    descriptionParts.length > 0 ? `DESCRIPTION:${descriptionParts.join("\\n\\n")}` : "",
    options.location ? `LOCATION:${options.location.replace(/\n/g, " ")}` : "",
    options.location ? `URL:${options.location}` : "",
    `ORGANIZER;CN=${options.organizerName}:mailto:${options.organizerEmail}`,
    attendeeLines,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return ics;
}

/**
 * Creates calendar event, persists attendees, and automatically sends .ics invite emails (Section 4 & 8)
 */
export async function createCalendarEvent(params: CreateEventParams) {
  const start = new Date(params.startTime);
  const end = new Date(params.endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    throw new Error("Invalid start or end time. End time must be after start time.");
  }

  const account = await prisma.account.findUnique({
    where: { id: params.accountId },
    select: { name: true, logoUrl: true, replyToEmail: true },
  });

  const creator = await prisma.user.findUnique({
    where: { id: params.createdById },
    select: { name: true, email: true },
  });

  // Normalize meeting link / Google Meet link (ensure https:// for clickable web link)
  let meetingLink = params.locationUrl?.trim() || null;
  if (
    meetingLink &&
    !/^https?:\/\//i.test(meetingLink) &&
    (meetingLink.includes(".") || meetingLink.toLowerCase().startsWith("meet.") || meetingLink.toLowerCase().startsWith("zoom."))
  ) {
    meetingLink = `https://${meetingLink}`;
  }

  // Resolve attendee emails and details from existing user/client accounts & deduplicate
  const resolvedAttendees: Array<{
    email: string;
    name: string;
    userId: string | null;
    isClient: boolean;
  }> = [];

  const seenEmails = new Set<string>();

  for (const raw of params.attendees) {
    let email = raw.email?.trim().toLowerCase() || "";
    let name = raw.name?.trim() || "";
    let userId: string | null = raw.userId || null;
    let isClient = Boolean(raw.isClient);

    // 1. Client: retrieve official email address directly from Client module (Client model)
    if (isClient || (raw as any).clientId) {
      const cId = (raw as any).clientId || raw.userId || params.clientId;
      if (cId) {
        const clientRecord = await prisma.client.findFirst({
          where: { id: cId, ...(params.accountId ? { accountId: params.accountId } : {}) },
          select: { id: true, name: true, email: true },
        });
        if (clientRecord) {
          if (clientRecord.email?.trim()) {
            email = clientRecord.email.trim().toLowerCase();
          }
          name = clientRecord.name || name;
          isClient = true;
          userId = null;
        }
      }
    } else if (userId) {
      // 2. Employee: retrieve official email address directly from Employee module (User model)
      const userRecord = await prisma.user.findFirst({
        where: { id: userId, ...(params.accountId ? { accountId: params.accountId } : {}) },
        select: { id: true, name: true, email: true },
      });
      if (userRecord) {
        if (userRecord.email?.trim()) {
          email = userRecord.email.trim().toLowerCase();
        }
        name = userRecord.name || name;
        userId = userRecord.id;
        isClient = false;
      }
    } else if (email) {
      // 3. Fallback: match by email against Client module or Employee module
      const clientRecord = await prisma.client.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, ...(params.accountId ? { accountId: params.accountId } : {}) },
        select: { id: true, name: true, email: true },
      });
      if (clientRecord) {
        if (clientRecord.email?.trim()) {
          email = clientRecord.email.trim().toLowerCase();
        }
        name = clientRecord.name || name;
        isClient = true;
      } else {
        const userRecord = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" }, ...(params.accountId ? { accountId: params.accountId } : {}) },
          select: { id: true, name: true, email: true },
        });
        if (userRecord) {
          if (userRecord.email?.trim()) {
            email = userRecord.email.trim().toLowerCase();
          }
          name = userRecord.name || name;
          userId = userRecord.id;
          isClient = false;
        }
      }
    }

    if (!email) continue;

    // Avoid duplicate invitations to the same email address
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);

    resolvedAttendees.push({
      email,
      name: name || email,
      userId,
      isClient,
    });
  }

  const event = await prisma.event.create({
    data: {
      accountId: params.accountId,
      createdById: params.createdById,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      startTime: start,
      endTime: end,
      locationUrl: meetingLink || params.locationUrl?.trim() || null,
      clientId: params.clientId || null,
      projectId: params.projectId || null,
      attendees: {
        create: resolvedAttendees.map((a) => ({
          accountId: params.accountId,
          email: a.email,
          name: a.name || null,
          userId: a.userId || null,
          isClient: a.isClient,
        })),
      },
    },
    include: {
      attendees: true,
      client: true,
      project: true,
    },
  });

  const invitationResults = {
    sent: [] as Array<{ email: string; name: string }>,
    failed: [] as Array<{ email: string; name: string; error: string }>,
  };

  // Configure transporter using existing SMTP settings
  let transporter: any = null;
  let smtpFrom = "ClientHub Notifications <ellowwwteam@gmail.com>";
  let smtpInitError: string | null = null;
  try {
    const cfg = await getSmtpSettings();
    smtpFrom = cfg.from || smtpFrom;
    if (!cfg.user || !cfg.pass) {
      smtpInitError = "SMTP user or password credentials are not configured";
    } else {
      transporter = createTransporter(cfg);
    }
  } catch (cfgErr: any) {
    smtpInitError = cfgErr.message || "Failed to initialize SMTP transporter";
    console.error("[createCalendarEvent SMTP config error]:", cfgErr.message);
  }

  // Format date and time for invitation email body
  const dateStr = start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeStartStr = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const timeEndStr = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const replyTo =
    account?.replyToEmail && !account.replyToEmail.endsWith(".local") && account.replyToEmail.includes("@")
      ? account.replyToEmail
      : creator?.email && !creator.email.endsWith(".local") && creator.email.includes("@")
      ? creator.email
      : undefined;

  for (const attendee of resolvedAttendees) {
    const lines = [
      `Hello ${attendee.name || "there"},`,
      `You have been invited to a meeting scheduled by ${creator?.name || account?.name || "your agency"}.`,
      `<strong>Meeting Title:</strong> ${event.title}`,
      `<strong>Date:</strong> ${dateStr}`,
      `<strong>Start Time:</strong> ${timeStartStr}`,
      `<strong>End Time:</strong> ${timeEndStr}`,
    ];

    if (event.description?.trim()) {
      lines.push(`<strong>Meeting Description:</strong> ${event.description.trim()}`);
    }

    if (meetingLink) {
      lines.push(
        `<strong>Meeting Link:</strong> <a href="${meetingLink}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; font-weight: 600; text-decoration: underline;">${meetingLink}</a>`
      );
    }

    const emailHtml = buildClientHubEmailHtml({
      agencyName: account?.name || "Acme Digital Agency Global",
      agencyLogoUrl: account?.logoUrl,
      heading: `Meeting Invitation: ${event.title}`,
      messageLines: lines,
      buttonText: meetingLink ? "Join Meeting / Google Meet" : undefined,
      buttonUrl: meetingLink || undefined,
    });

    // Record notification in database
    const notif = await prisma.notification.create({
      data: {
        accountId: params.accountId,
        type: "MEETING_INVITE",
        recipientEmail: attendee.email,
        subject: `Meeting Invitation: ${event.title}`,
        bodyHtml: emailHtml,
        metadata: JSON.stringify({
          eventId: event.id,
          title: event.title,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          locationUrl: meetingLink || event.locationUrl,
        }),
        status: "QUEUED",
      },
    });

    // Internal placeholder accounts (e.g. admin@clienthub.local) are simulated without hitting external SMTP
    if (attendee.email.toLowerCase().endsWith(".local")) {
      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          errorLog: "Internal test account — simulated delivery",
        },
      });
      invitationResults.sent.push({
        email: attendee.email,
        name: attendee.name,
      });
      continue;
    }

    if (!transporter) {
      const errReason = smtpInitError || "SMTP transporter could not be initialized";
      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          status: "FAILED",
          errorLog: errReason,
        },
      });
      invitationResults.failed.push({
        email: attendee.email,
        name: attendee.name,
        error: errReason,
      });
      continue;
    }

    try {
      // Send clean branded HTML card WITHOUT .ics attachment so email clients (Zoho/Gmail) do not inject the calendar RSVP banner
      await transporter.sendMail({
        from: smtpFrom,
        to: attendee.email,
        replyTo,
        subject: `Meeting Invitation: ${event.title}`,
        html: emailHtml,
      });

      // Update notification status to SENT only upon successful delivery
      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          errorLog: null,
        },
      });

      invitationResults.sent.push({
        email: attendee.email,
        name: attendee.name,
      });
    } catch (sendErr: any) {
      console.error(`[Meeting Invite Delivery Failed for ${attendee.email}]:`, sendErr.message);
      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          status: "FAILED",
          errorLog: sendErr.message || "Failed to deliver meeting invitation email",
        },
      });

      invitationResults.failed.push({
        email: attendee.email,
        name: attendee.name,
        error: sendErr.message || "Failed to deliver email",
      });
    }
  }

  return { event, invitationResults };
}

