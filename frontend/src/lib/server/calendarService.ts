import { prisma } from "../prisma";
import { queueNotification, buildClientHubEmailHtml } from "./notificationService";
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
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=${a.name || a.email}:mailto:${a.email}`
    )
    .join("\r\n");

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
    options.description ? `DESCRIPTION:${options.description.replace(/\n/g, "\\n")}` : "",
    options.location ? `LOCATION:${options.location.replace(/\n/g, " ")}` : "",
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
 * Creates a Calendar Event, records attendees, generates .ics, and automatically sends email invites to selected participants.
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

    // If userId is provided, look up existing user account to ensure official email and name
    if (userId && !isClient) {
      const userRecord = await prisma.user.findFirst({
        where: { id: userId, accountId: params.accountId },
        select: { id: true, name: true, email: true },
      });
      if (userRecord) {
        email = userRecord.email.trim().toLowerCase();
        name = userRecord.name;
        userId = userRecord.id;
      }
    } else if (isClient || (params.clientId && !userId)) {
      // Look up client account
      const clientRecord = await prisma.client.findFirst({
        where: { id: params.clientId || (userId ? userId : undefined), accountId: params.accountId },
        select: { id: true, name: true, email: true },
      });
      if (clientRecord) {
        email = clientRecord.email.trim().toLowerCase();
        name = clientRecord.name;
        isClient = true;
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
      locationUrl: params.locationUrl?.trim() || null,
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

  // Generate .ics calendar invite content
  const icsContent = generateIcsInvite({
    uid: event.id,
    title: event.title,
    description: event.description,
    startTime: start,
    endTime: end,
    location: event.locationUrl,
    organizerName: creator?.name || account?.name || "ClientHub Agency",
    organizerEmail: account?.replyToEmail || creator?.email || "notifications@clienthub.local",
    attendees: resolvedAttendees,
  });

  const invitationResults = {
    sent: [] as Array<{ email: string; name: string }>,
    failed: [] as Array<{ email: string; name: string; error: string }>,
  };

  // Configure transporter using existing SMTP settings
  let transporter: any = null;
  let smtpFrom = "ClientHub Notifications <notifications@clienthub.local>";
  try {
    const cfg = await getSmtpSettings();
    smtpFrom = cfg.from || smtpFrom;
    transporter = createTransporter(cfg);
  } catch (cfgErr: any) {
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

  for (const attendee of resolvedAttendees) {
    const lines = [
      `Hello ${attendee.name || "there"},`,
      `You have been invited to a meeting scheduled by ${creator?.name || account?.name || "your agency"}.`,
      `<strong>Meeting Title:</strong> ${event.title}`,
      `<strong>Date:</strong> ${dateStr}`,
      `<strong>Time:</strong> ${timeStartStr} – ${timeEndStr}`,
    ];

    if (event.description?.trim()) {
      lines.push(`<strong>Description:</strong> ${event.description.trim()}`);
    }

    if (event.locationUrl?.trim()) {
      lines.push(
        `<strong>Location / Meeting Link:</strong> <a href="${event.locationUrl.trim()}" target="_blank" rel="noopener noreferrer">${event.locationUrl.trim()}</a>`
      );
    }

    lines.push("A calendar invitation (.ics) file is attached to this email. You can open it to add this meeting to your calendar.");

    const emailHtml = buildClientHubEmailHtml({
      agencyName: account?.name || "ClientHub Agency",
      agencyLogoUrl: account?.logoUrl,
      heading: `Meeting Invitation: ${event.title}`,
      messageLines: lines,
      buttonText: event.locationUrl ? "Join Meeting" : undefined,
      buttonUrl: event.locationUrl || undefined,
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
          locationUrl: event.locationUrl,
        }),
        status: "QUEUED",
      },
    });

    if (!transporter) {
      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          status: "FAILED",
          errorLog: "SMTP transporter could not be initialized",
        },
      });
      invitationResults.failed.push({
        email: attendee.email,
        name: attendee.name,
        error: "SMTP transporter could not be initialized",
      });
      continue;
    }

    try {
      await transporter.sendMail({
        from: smtpFrom,
        to: attendee.email,
        replyTo: account?.replyToEmail || creator?.email || undefined,
        subject: `Meeting Invitation: ${event.title}`,
        html: emailHtml,
        attachments: [
          {
            filename: "invite.ics",
            content: icsContent,
            contentType: "text/calendar; charset=utf-8; method=REQUEST",
          },
        ],
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
      // Appropriately mark as FAILED without incorrectly marking as SENT
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

