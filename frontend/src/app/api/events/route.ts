import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createCalendarEvent } from "@/lib/server/calendarService";

// GET /api/events (Admin & Employee)
export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const projectId = searchParams.get("projectId");

  const whereClause: any = {
    accountId: session.accountId,
  };

  // Employees only see events for clients assigned to them or created by them
  if (session.role === "EMPLOYEE") {
    whereClause.OR = [
      { createdById: session.userId },
      {
        client: {
          assignments: {
            some: { userId: session.userId },
          },
        },
      },
      {
        attendees: {
          some: { userId: session.userId },
        },
      },
    ];
  }

  if (clientId) whereClause.clientId = clientId;
  if (projectId) whereClause.projectId = projectId;

  const events = await prisma.event.findMany({
    where: whereClause,
    orderBy: { startTime: "asc" },
    include: {
      client: { select: { id: true, name: true, company: true } },
      project: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, email: true } },
      attendees: true,
    },
  });

  return NextResponse.json({ events });
}

// POST /api/events (Admin & Employee)
export async function POST(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, description, startTime, endTime, locationUrl, clientId, projectId, attendees } = body;

    if (!title || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Event title, start time, and end time are required." },
        { status: 400 }
      );
    }

    const result = await createCalendarEvent({
      accountId: session.accountId,
      createdById: session.userId,
      title,
      description,
      startTime,
      endTime,
      locationUrl,
      clientId: clientId || undefined,
      projectId: projectId || undefined,
      attendees: Array.isArray(attendees) ? attendees : [],
    });

    return NextResponse.json({
      event: result.event,
      invitationResults: result.invitationResults,
    });
  } catch (err: any) {
    console.error("Create calendar event error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create calendar event" },
      { status: 400 }
    );
  }
}

