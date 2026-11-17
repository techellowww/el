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
    const {
      title,
      description,
      startTime,
      endTime,
      locationUrl,
      clientId,
      projectId,
      attendees,
      selectedEmployeeIds,
      employeeIds,
      inviteClient,
    } = body;

    if (!title || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Event title, start time, and end time are required." },
        { status: 400 }
      );
    }

    // Requirement: Assigned user / employee creates meeting -> Project is mandatory
    if (session.role === "EMPLOYEE" && !projectId) {
      return NextResponse.json(
        { error: "Project selection is mandatory when creating a meeting." },
        { status: 400 }
      );
    }

    let effectiveClientId = clientId || null;
    const mergedAttendees: any[] = Array.isArray(attendees) ? [...attendees] : [];
    const empIdsToInclude = Array.isArray(selectedEmployeeIds)
      ? selectedEmployeeIds
      : Array.isArray(employeeIds)
      ? employeeIds
      : [];

    for (const empId of empIdsToInclude) {
      if (!mergedAttendees.some((a) => a.userId === empId)) {
        mergedAttendees.push({ userId: empId, isClient: false });
      }
    }

    // Auto-identify project client and assigned users when a project is selected
    if (projectId) {
      const projectRecord = await prisma.project.findFirst({
        where: { id: projectId, accountId: session.accountId },
        include: {
          client: {
            include: {
              assignments: {
                select: { userId: true },
              },
            },
          },
        },
      });

      if (!projectRecord) {
        return NextResponse.json(
          { error: "Selected project was not found." },
          { status: 404 }
        );
      }

      // Check permission for employee: must be assigned to this project's client
      if (session.role === "EMPLOYEE") {
        const isAssigned = projectRecord.client?.assignments?.some(
          (a: any) => a.userId === session.userId
        );
        if (!isAssigned) {
          return NextResponse.json(
            { error: "Forbidden: You are not assigned to this project." },
            { status: 403 }
          );
        }
      }

      // Auto-identify client associated with that project
      if (projectRecord.clientId) {
        effectiveClientId = projectRecord.clientId;
      }

      // Auto-identify and auto-select assigned users for that project
      if (projectRecord.client?.assignments) {
        for (const assign of projectRecord.client.assignments) {
          if (assign.userId && !mergedAttendees.some((a) => a.userId === assign.userId)) {
            mergedAttendees.push({ userId: assign.userId, isClient: false });
          }
        }
      }
    }

    // Auto-include client in attendees
    if (
      effectiveClientId &&
      (inviteClient === true || inviteClient === undefined) &&
      !mergedAttendees.some((a) => a.isClient || a.clientId === effectiveClientId)
    ) {
      mergedAttendees.push({ clientId: effectiveClientId, isClient: true });
    }

    // Ensure meeting creator is included in attendees
    if (!mergedAttendees.some((a) => a.userId === session.userId)) {
      mergedAttendees.push({ userId: session.userId, isClient: false });
    }

    const result = await createCalendarEvent({
      accountId: session.accountId,
      createdById: session.userId,
      title,
      description,
      startTime,
      endTime,
      locationUrl,
      clientId: effectiveClientId || undefined,
      projectId: projectId || undefined,
      attendees: mergedAttendees,
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

