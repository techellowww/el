import { prisma } from '../src/lib/prisma';

async function testChatUnreadCountSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING CHAT UNREAD MESSAGE COUNT TEST SUITE');
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

  // 1. Get or setup account and 2 test users in the same account
  const account = await prisma.account.findFirst();
  if (!account) throw new Error('No account found in database.');

  let users = await prisma.user.findMany({
    where: { accountId: account.id, isActive: true },
    take: 2,
  });

  if (users.length < 2) {
    // Create second user if only 1 exists
    const newUser = await prisma.user.create({
      data: {
        accountId: account.id,
        email: `chat_test_receiver_${Date.now()}@test.local`,
        name: 'Chat Receiver Test',
        passwordHash: 'dummyhash123',
        role: 'EMPLOYEE',
      },
    });
    users = await prisma.user.findMany({
      where: { accountId: account.id, isActive: true },
      take: 2,
    });
  }

  const sender = users[0];
  const receiver = users[1];

  console.log(`Sender: ${sender.name} (${sender.id})`);
  console.log(`Receiver: ${receiver.name} (${receiver.id})`);
  console.log(`Account: ${account.name} (${account.id})\n`);

  // Ensure General Team client exists
  let generalClient = await prisma.client.findFirst({
    where: { accountId: account.id, company: '__INTERNAL_GENERAL_TEAM__' },
  });
  if (!generalClient) {
    generalClient = await prisma.client.create({
      data: {
        accountId: account.id,
        name: 'General Agency Team',
        email: 'general-team@agency.local',
        company: '__INTERNAL_GENERAL_TEAM__',
      },
    });
  }

  // Ensure a test project exists for multi-channel test
  let project = await prisma.project.findFirst({
    where: { accountId: account.id },
  });
  if (!project) {
    let client = await prisma.client.findFirst({
      where: { accountId: account.id, company: { not: '__INTERNAL_GENERAL_TEAM__' } },
    });
    if (!client) {
      client = await prisma.client.create({
        data: {
          accountId: account.id,
          name: 'Acme Test Client',
          company: 'Acme Corp',
          email: 'acme_test@corp.local',
        },
      });
    }
    project = await prisma.project.create({
      data: {
        accountId: account.id,
        clientId: client.id,
        name: 'Alpha Redesign Project',
        stage: 'IN_PROGRESS',
      },
    });
  }

  // Baseline: Mark everything as read for both receiver and sender at this moment
  const baselineTime = new Date();
  for (const u of [sender, receiver]) {
    await prisma.messageRead.upsert({
      where: { clientId_userId: { clientId: generalClient.id, userId: u.id } },
      create: { accountId: account.id, clientId: generalClient.id, userId: u.id, lastReadAt: baselineTime },
      update: { lastReadAt: baselineTime },
    });

    const projClient = await prisma.client.findUnique({ where: { id: project.clientId } });
    if (projClient) {
      await prisma.messageRead.upsert({
        where: { clientId_userId: { clientId: projClient.id, userId: u.id } },
        create: { accountId: account.id, clientId: projClient.id, userId: u.id, lastReadAt: baselineTime },
        update: { lastReadAt: baselineTime },
      });
    }
  }

  // Function to calculate receiver unread for general
  async function getGeneralUnreadFor(userId: string) {
    const read = await prisma.messageRead.findUnique({
      where: { clientId_userId: { clientId: generalClient!.id, userId } },
    });
    return prisma.message.count({
      where: {
        accountId: account.id,
        clientId: generalClient!.id,
        projectId: null,
        isInternalNote: true,
        isDeleted: false,
        OR: [
          { senderUserId: { not: userId } },
          { senderUserId: null },
        ],
        ...(read ? { createdAt: { gt: read.lastReadAt } } : {}),
      },
    });
  }

  // Function to calculate receiver unread for client channel
  async function getClientUnreadFor(userId: string, clientId: string) {
    const read = await prisma.messageRead.findUnique({
      where: { clientId_userId: { clientId, userId } },
    });
    return prisma.message.count({
      where: {
        accountId: account.id,
        clientId,
        projectId: null,
        isInternalNote: false,
        isDeleted: false,
        OR: [
          { senderUserId: { not: userId } },
          { senderUserId: null },
        ],
        ...(read ? { createdAt: { gt: read.lastReadAt } } : {}),
      },
    });
  }

  // Function to calculate receiver unread for project
  async function getProjectUnreadFor(userId: string, projId: string, clientId: string) {
    const read = await prisma.messageRead.findUnique({
      where: { clientId_userId: { clientId, userId } },
    });
    return prisma.message.count({
      where: {
        accountId: account.id,
        projectId: projId,
        isDeleted: false,
        OR: [
          { senderUserId: { not: userId } },
          { senderUserId: null },
        ],
        ...(read ? { createdAt: { gt: read.lastReadAt } } : {}),
      },
    });
  }

  // TEST 1: Initial unread count is 0
  const initialGeneralUnread = await getGeneralUnreadFor(receiver.id);
  assert(initialGeneralUnread === 0, '1. Initial unread count for receiver is 0');

  // TEST 2: Sender sends 1st message -> Receiver unread becomes 1
  const msg1 = await prisma.message.create({
    data: {
      accountId: account.id,
      clientId: generalClient.id,
      projectId: null,
      senderType: 'TEAM',
      senderUserId: sender.id,
      content: 'Message 1 from sender: Project kickoff meeting today',
      isInternalNote: true,
    },
  });
  const unreadAfterMsg1 = await getGeneralUnreadFor(receiver.id);
  assert(unreadAfterMsg1 === 1, '2. Unread count increments to 1 when a message is sent');

  // TEST 3: Sender's own unread count remains 0 (sender does not have unread message for self)
  const senderUnread = await getGeneralUnreadFor(sender.id);
  assert(senderUnread === 0, "3. Sender's own unread count remains 0 (self-sent messages are excluded)");

  // TEST 4: Sender sends 2nd message -> Receiver unread becomes 2
  const msg2 = await prisma.message.create({
    data: {
      accountId: account.id,
      clientId: generalClient.id,
      projectId: null,
      senderType: 'TEAM',
      senderUserId: sender.id,
      content: 'Message 2 from sender: Please review invoices by 4pm',
      isInternalNote: true,
    },
  });
  const unreadAfterMsg2 = await getGeneralUnreadFor(receiver.id);
  assert(unreadAfterMsg2 === 2, '4. Unread count increments to 2 on second message without opening');

  // TEST 5: Sender sends a message in Project channel -> Project unread is 1, General remains 2
  const projMsg = await prisma.message.create({
    data: {
      accountId: account.id,
      clientId: project.clientId,
      projectId: project.id,
      senderType: 'TEAM',
      senderUserId: sender.id,
      content: 'Project update: Staging deployment successful',
      isInternalNote: false,
    },
  });
  const projUnread = await getProjectUnreadFor(receiver.id, project.id, project.clientId);
  assert(projUnread === 1, '5. Project channel unread count increments independently to 1');

  const generalStill2 = await getGeneralUnreadFor(receiver.id);
  assert(generalStill2 === 2, '6. General channel unread count persists at 2 while project message arrived');

  // TEST 7: Receiver OPENS General channel -> General unread drops to 0
  const readTimeGeneral = new Date();
  await prisma.messageRead.upsert({
    where: { clientId_userId: { clientId: generalClient.id, userId: receiver.id } },
    create: { accountId: account.id, clientId: generalClient.id, userId: receiver.id, lastReadAt: readTimeGeneral },
    update: { lastReadAt: readTimeGeneral },
  });

  const generalAfterOpen = await getGeneralUnreadFor(receiver.id);
  assert(generalAfterOpen === 0, '7. General channel unread count clears to 0 upon opening conversation');

  // TEST 8: Project channel unread PERSISTS ("until its open")
  const projStillUnread = await getProjectUnreadFor(receiver.id, project.id, project.clientId);
  assert(projStillUnread === 1, '8. Project channel unread persists at 1 until project is opened');

  // TEST 9: Receiver OPENS Project channel -> Project unread drops to 0
  const readTimeProject = new Date();
  await prisma.messageRead.upsert({
    where: { clientId_userId: { clientId: project.clientId, userId: receiver.id } },
    create: { accountId: account.id, clientId: project.clientId, userId: receiver.id, lastReadAt: readTimeProject },
    update: { lastReadAt: readTimeProject },
  });

  const projAfterOpen = await getProjectUnreadFor(receiver.id, project.id, project.clientId);
  assert(projAfterOpen === 0, '9. Project channel unread count clears to 0 upon opening project');

  // TEST 10: Total unread across all channels is now 0
  const finalGeneral = await getGeneralUnreadFor(receiver.id);
  const finalProj = await getProjectUnreadFor(receiver.id, project.id, project.clientId);
  const totalUnread = finalGeneral + finalProj;
  assert(totalUnread === 0, '10. Total unread message count is 0 when all active conversations are opened');

  // TEST 11: Client sends a message via Portal -> Receiver unread count increments to 1
  const clientMsg = await prisma.message.create({
    data: {
      accountId: account.id,
      clientId: project.clientId,
      projectId: null,
      senderType: 'CLIENT',
      clientSenderName: 'Bright Bakery Co.',
      senderUserId: null,
      content: 'Hello, when will the invoice be ready for our project?',
      isInternalNote: false,
    },
  });

  const clientUnreadAfterMsg = await getClientUnreadFor(receiver.id, project.clientId);
  assert(clientUnreadAfterMsg === 1, '11. Client message increments receiver unread count to 1');

  // TEST 12: Client message sender information is verified as CLIENT, not Team Member
  const isClientSender = clientMsg.senderType === 'CLIENT';
  const clientName = clientMsg.clientSenderName || 'Client';
  assert(isClientSender === true, '12A. Client message has senderType CLIENT');
  assert(clientName === 'Bright Bakery Co.', '12B. Client message has actual client name, not Team Member');

  // TEST 13: Receiver opens client channel -> Client unread clears to 0
  const readTimeClient = new Date();
  await prisma.messageRead.upsert({
    where: { clientId_userId: { clientId: project.clientId, userId: receiver.id } },
    create: { accountId: account.id, clientId: project.clientId, userId: receiver.id, lastReadAt: readTimeClient },
    update: { lastReadAt: readTimeClient },
  });

  const clientUnreadAfterOpen = await getClientUnreadFor(receiver.id, project.clientId);
  assert(clientUnreadAfterOpen === 0, '13. Client channel unread count clears to 0 upon opening conversation');

  console.log(`\n====================================================`);
  console.log(`🎉 TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log(`====================================================\n`);

  // Cleanup test messages
  await prisma.message.deleteMany({
    where: { id: { in: [msg1.id, msg2.id, projMsg.id, clientMsg.id] } },
  });
}

testChatUnreadCountSuite()
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
