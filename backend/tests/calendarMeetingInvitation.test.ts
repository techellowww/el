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

  // Cleanup test event
  await prisma.event.delete({ where: { id: event.id } });
  await prisma.notification.deleteMany({
    where: {
      accountId: account.id,
      type: 'MEETING_INVITE',
      metadata: { contains: event.id },
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
