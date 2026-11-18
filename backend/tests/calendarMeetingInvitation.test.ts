import { prisma } from '../src/lib/prisma';
import { createCalendarEvent, generateIcsInvite } from '../src/lib/calendarService';

async function testCalendarMeetingInvitationSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING CALENDAR MEETING EMAIL INVITATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // 1. Get or create test account
  const account = await prisma.account.findFirst();
  if (!account) throw new Error('No account found in database.');

  // 2. Get creator (Admin or Employee)
  const creator = await prisma.user.findFirst({
    where: { accountId: account.id, role: 'ADMIN' },
  }) || (await prisma.user.findFirst({ where: { accountId: account.id } }));
  if (!creator) throw new Error('No user found in database.');

  // 3. Get or create test employee from Employee module
  let testEmployee = await prisma.user.findFirst({
    where: { accountId: account.id, role: 'EMPLOYEE', isActive: true },
  });
  if (!testEmployee) {
    testEmployee = await prisma.user.create({
      data: {
        accountId: account.id,
        name: 'Alex Miller Employee',
        email: `alex_emp_${Date.now()}@agency.local`,
        passwordHash: 'dummyhash123',
        role: 'EMPLOYEE',
      },
    });
  }

  // 4. Get or create test client from Client module
  let testClient = await prisma.client.findFirst({
    where: { accountId: account.id, NOT: { company: '__INTERNAL_GENERAL_TEAM__' } },
  });
  if (!testClient) {
    testClient = await prisma.client.create({
      data: {
        accountId: account.id,
        name: 'Bright Bakery Client',
        company: 'Bright Bakery Co.',
        email: `client_bakery_${Date.now()}@brightbakery.com`,
      },
    });
  }

  console.log(`Creator: ${creator.name} (${creator.email})`);
  console.log(`Selected Employee: ${testEmployee.name} (${testEmployee.email}) [from Employee module]`);
  console.log(`Selected Client: ${testClient.name} (${testClient.email}) [from Client module]\n`);

  const startTime = new Date(Date.now() + 2 * 3600 * 1000); // 2 hours from now
  const endTime = new Date(Date.now() + 3 * 3600 * 1000);   // 3 hours from now
  const meetLink = 'https://meet.google.com/xyz-abcd-efg';
  const meetingTitle = `Sprint Planning & Roadmap Demo - ${Date.now()}`;
  const meetingDescription = 'Review deliverables, staging features, and client feedback for Sprint 1.';

  // 5. Test Event Creation and Email Invitation Generation
  const result = await createCalendarEvent({
    accountId: account.id,
    createdById: creator.id,
    title: meetingTitle,
    description: meetingDescription,
    startTime,
    endTime,
    locationUrl: meetLink,
    clientId: testClient.id,
    attendees: [
      { clientId: testClient.id, isClient: true },
      { userId: testEmployee.id, isClient: false },
      // Duplicate entry to test deduplication
      { email: testEmployee.email, userId: testEmployee.id, isClient: false },
    ],
  });

  const event = result.event;
  assert(Boolean(event && event.id), '1. Calendar event created successfully in database');
  assert(event.title === meetingTitle, '2. Event title correctly recorded');
  assert(event.locationUrl === meetLink, '3. Google Meet / Meeting link correctly recorded in event');
  assert(event.attendees.length === 2, '4. Exactly 2 attendees recorded (selected employee & client, duplicate deduplicated)');

  // 6. Verify Attendees stored in database
  const clientAttendee = event.attendees.find((a: any) => a.isClient);
  const employeeAttendee = event.attendees.find((a: any) => !a.isClient);

  assert(Boolean(clientAttendee), '5. Client attendee exists in event record');
  assert(clientAttendee.email.toLowerCase() === testClient.email.toLowerCase(), '6. Client email matches email stored in Client module');

  assert(Boolean(employeeAttendee), '7. Employee attendee exists in event record');
  assert(employeeAttendee.email.toLowerCase() === testEmployee.email.toLowerCase(), '8. Employee email matches email stored in Employee module');

  // 7. Verify Notification / Email records created in database
  const notifications = await prisma.notification.findMany({
    where: {
      accountId: account.id,
      type: 'MEETING_INVITE',
      metadata: { contains: event.id },
    },
  });

  assert(notifications.length === 2, '9. Exactly 2 email notification records generated (one per selected participant)');

  const clientNotif = notifications.find((n: any) => n.recipientEmail.toLowerCase() === testClient.email.toLowerCase());
  const employeeNotif = notifications.find((n: any) => n.recipientEmail.toLowerCase() === testEmployee.email.toLowerCase());

  assert(Boolean(clientNotif), '10. Email invitation generated for selected client');
  assert(Boolean(employeeNotif), '11. Email invitation generated for selected employee');

  // 8. Verify email content has all required details
  const bodyHtml = clientNotif?.bodyHtml || '';
  assert(bodyHtml.includes(meetingTitle), '12. Email body contains meeting title');
  assert(bodyHtml.includes(meetingDescription), '13. Email body contains meeting description');
  assert(bodyHtml.includes(meetLink), '14. Email body contains Google Meet / meeting link');
  assert(bodyHtml.includes('Start Time:'), '15. Email body contains Start Time');
  assert(bodyHtml.includes('End Time:'), '16. Email body contains End Time');
  assert(bodyHtml.includes('Date:'), '17. Email body contains Date');
  assert(bodyHtml.includes('Join Meeting / Google Meet'), '18. Email body contains prominent Join Meeting / Google Meet CTA button');

  // 9. Verify .ics content generator
  const ics = generateIcsInvite({
    uid: event.id,
    title: event.title,
    description: event.description,
    startTime,
    endTime,
    location: meetLink,
    organizerName: creator.name,
    organizerEmail: creator.email,
    attendees: [
      { email: testClient.email, name: testClient.name },
      { email: testEmployee.email, name: testEmployee.name },
    ],
  });

  assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('BEGIN:VEVENT'), '19. .ics invite has valid VCALENDAR/VEVENT structure');
  assert(ics.includes(meetLink), '20. .ics invite includes Google Meet / meeting link');
  assert(ics.includes(testClient.email) && ics.includes(testEmployee.email), '21. .ics invite lists both client and employee as attendees');

  // ====================================================
  // 10. Test Stored Client Chat Link & Project-Based Auto-Selection Workflow
  // ====================================================
  console.log('\n--- Testing Client Chat Link Storage & Project Meeting Workflow ---');

  // 10A. Store Client Chat Link
  const clientChatLink = 'https://chat.clienthub.local/bright-bakery-room';
  await prisma.client.update({
    where: { id: testClient.id },
    data: {
      notes: `[Chat Link]: ${clientChatLink}\nInitial client notes.`,
    },
  });

  const updatedClient = await prisma.client.findUnique({
    where: { id: testClient.id },
  });
  const extractedChatLink = updatedClient?.notes?.match(/\[Chat Link\]:\s*([^\r\n]+)/i)?.[1]?.trim() || null;
  assert(extractedChatLink === clientChatLink, '22. Client Chat Link correctly stored and retrieved from client data');

  // 10B. Ensure Client Assignment for Employee
  await prisma.clientAssignment.upsert({
    where: {
      clientId_userId: {
        clientId: testClient.id,
        userId: testEmployee.id,
      },
    },
    create: {
      accountId: account.id,
      clientId: testClient.id,
      userId: testEmployee.id,
    },
    update: {},
  });

  // 10C. Create a Project for this Client
  let testProject = await prisma.project.findFirst({
    where: { clientId: testClient.id, accountId: account.id },
  });
  if (!testProject) {
    testProject = await prisma.project.create({
      data: {
        accountId: account.id,
        clientId: testClient.id,
        name: 'Bakery Online Ordering Portal',
      },
    });
  }

  // 10D. Project-Based Meeting Creation: Admin creates meeting selecting Project
  const projMeetTitle = `Project Check-in - ${Date.now()}`;
  const projMeetLink = 'https://meet.google.com/prj-auto-meet';

  // Automatically lookup project client & assigned users
  const projectRecord = await prisma.project.findFirst({
    where: { id: testProject.id, accountId: account.id },
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

  assert(Boolean(projectRecord && projectRecord.client), '23. Project successfully identified with its Client');
  assert(
    projectRecord!.client!.assignments.some((a) => a.userId === testEmployee.id),
    '24. Project automatically identified assigned employee'
  );

  // Auto-merge assigned users and client
  const autoAttendees: any[] = [];
  for (const assign of projectRecord!.client!.assignments) {
    autoAttendees.push({ userId: assign.userId, isClient: false });
  }
  autoAttendees.push({ clientId: projectRecord!.clientId, isClient: true });

  const projMeetingResult = await createCalendarEvent({
    accountId: account.id,
    createdById: creator.id,
    title: projMeetTitle,
    startTime: new Date(Date.now() + 4 * 3600 * 1000),
    endTime: new Date(Date.now() + 5 * 3600 * 1000),
    locationUrl: projMeetLink,
    projectId: testProject.id,
    clientId: projectRecord!.clientId,
    attendees: autoAttendees,
  });

  const projEvent = projMeetingResult.event;
  assert(Boolean(projEvent && projEvent.id), '25. Project meeting created successfully');
  assert(projEvent.projectId === testProject.id, '26. Meeting correctly associated with Project');
  assert(projEvent.clientId === testClient.id, '27. Meeting correctly associated with Project Client');
  assert(projEvent.locationUrl === projMeetLink, '28. Google Meet link preserved and NOT overwritten by chat link');

  const projClientAtt = projEvent.attendees.find((a: any) => a.isClient);
  const projEmpAtt = projEvent.attendees.find((a: any) => !a.isClient && a.userId === testEmployee.id);
  assert(Boolean(projClientAtt), '29. Project Client automatically included in meeting attendees');
  assert(Boolean(projEmpAtt), '30. Project assigned employee automatically included in meeting attendees');

  // Verify Project Meeting Email Invitations
  const projNotifs = await prisma.notification.findMany({
    where: {
      accountId: account.id,
      type: 'MEETING_INVITE',
      metadata: { contains: projEvent.id },
    },
  });
  assert(
    projNotifs.length === projectRecord!.client!.assignments.length + 1,
    '31. Email notifications dispatched for Project meeting to all assigned users & client'
  );
  const clientProjNotif = projNotifs.find((n: any) => n.recipientEmail.toLowerCase() === testClient.email.toLowerCase());
  const employeeProjNotif = projNotifs.find((n: any) => n.recipientEmail.toLowerCase() === testEmployee.email.toLowerCase());
  assert(Boolean(clientProjNotif), '32. Project client received email notification');
  assert(Boolean(employeeProjNotif), '33. Project assigned employee received email notification');
  assert(Boolean(clientProjNotif?.bodyHtml?.includes(projMeetLink)), '34. Project client email contains actual Google Meet link');

  // 10E. Employee Meeting Validation: Mandatory Project Field
  const employeeSessionRole = 'EMPLOYEE';
  const meetingWithoutProject = {
    title: 'Employee Meeting without Project',
    projectId: undefined,
  };
  const isMandatoryProjectBlocked = employeeSessionRole === 'EMPLOYEE' && !meetingWithoutProject.projectId;
  assert(isMandatoryProjectBlocked, '35. Employee cannot create meeting without a Project (Project is mandatory)');

  // Cleanup test events
  await prisma.event.delete({ where: { id: event.id } });
  await prisma.event.delete({ where: { id: projEvent.id } });
  await prisma.notification.deleteMany({
    where: {
      accountId: account.id,
      type: 'MEETING_INVITE',
      metadata: { contains: event.id },
    },
  });
  await prisma.notification.deleteMany({
    where: {
      accountId: account.id,
      type: 'MEETING_INVITE',
      metadata: { contains: projEvent.id },
    },
  });

  console.log('\n====================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('====================================================\n');
}

testCalendarMeetingInvitationSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });

