import { prisma } from "./prisma";
import { queueNotification } from "./notificationService";

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
    email: string;
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
        `ATTENDEE;CN=${a.name || a.email};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`
    )
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ClientHub//Meeting Scheduler//EN",
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
}

/**
 * Creates calendar event, persists attendees, and sends .ics invite emails (Section 4 & 8)
 */
export async function createCalendarEvent(params: CreateEventParams) {
  const start = new Date(params.startTime);
  const end = new Date(params.endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    throw new Error("Invalid start or end time. End time must be after start time.");
  }

  const account = await prisma.account.findUnique({
    where: { id: params.accountId },
    select: { name: true, replyToEmail: true },
  });

  const creator = await prisma.user.findUnique({
    where: { id: params.createdById },
    select: { name: true, email: true },
  });

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
        create: params.attendees.map((a) => ({
          accountId: params.accountId,
          email: a.email.trim().toLowerCase(),
          name: a.name?.trim() || null,
          userId: a.userId || null,
          isClient: Boolean(a.isClient),
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
    attendees: params.attendees,
  });

  // Queue Meeting Invite email with .ics attachment to all attendees (Section 8)
  for (const attendee of params.attendees) {
    await queueNotification({
      accountId: params.accountId,
      type: "MEETING_INVITE",
      recipientEmail: attendee.email,
      subject: `Meeting Invite: ${event.title}`,
      metadata: {
        heading: `Meeting Invitation: ${event.title}`,
        lines: [
          `Hello ${attendee.name || "there"},`,
          `You have been invited to a calendar event by ${creator?.name || "your agency"}.`,
          `Date: ${start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`,
          `Time: ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          event.locationUrl ? `Meeting Link / Location: ${event.locationUrl}` : "",
          "A calendar .ics file has been attached to this invite for your calendar.",
        ].filter(Boolean),
        icsContent,
        buttonText: event.locationUrl ? "Join Meeting" : undefined,
        buttonUrl: event.locationUrl || undefined,
      },
    });
  }

  return event;
}

