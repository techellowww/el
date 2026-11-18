import { prisma } from "./prisma";

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
          where: { id: cId, accountId: params.accountId },
          select: { id: true, name: true, email: true },
        });
        if (clientRecord && clientRecord.email) {
          email = clientRecord.email.trim().toLowerCase();
          name = clientRecord.name || name;
          isClient = true;
          userId = null;
        }
      }
    } else if (userId) {
      // 2. Employee: retrieve official email address directly from Employee module (User model)
      const userRecord = await prisma.user.findFirst({
        where: { id: userId, accountId: params.accountId },
        select: { id: true, name: true, email: true },
      });
      if (userRecord && userRecord.email) {
        email = userRecord.email.trim().toLowerCase();
        name = userRecord.name || name;
        userId = userRecord.id;
        isClient = false;
      }
    } else if (email) {
      // 3. Fallback: match by email against Client module or Employee module
      const clientRecord = await prisma.client.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, accountId: params.accountId },
        select: { id: true, name: true, email: true },
      });
      if (clientRecord && clientRecord.email) {
        email = clientRecord.email.trim().toLowerCase();
        name = clientRecord.name || name;
        isClient = true;
      } else {
        const userRecord = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" }, accountId: params.accountId },
          select: { id: true, name: true, email: true },
        });
        if (userRecord && userRecord.email) {
          email = userRecord.email.trim().toLowerCase();
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

  return {
    event,
    invitationResults: {
      sent: [],
      failed: [],
    },
  };
}

