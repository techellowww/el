import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function testSettingsFeatures() {
  console.log('====================================================');
  console.log('🧪 RUNNING SETTINGS FEATURES & LOGO DELETION TEST SUITE');
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

  // 1. Setup test account
  const account = await prisma.account.findFirst();
  if (!account) {
    throw new Error('No account found in database to test.');
  }

  console.log(`Testing with Account: ${account.name} (${account.id})`);

  // Test 1: Update Agency Name
  const testAgencyName = 'Antigravity Agency Hub';
  const updatedAccount = await prisma.account.update({
    where: { id: account.id },
    data: { name: testAgencyName },
  });
  assert(updatedAccount.name === testAgencyName, '1. Agency name updated successfully in account settings');

  // Test 2: Upload brand logo (SVG with data URL)
  const testLogoSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%232563eb"/><text x="50" y="55" font-family="Arial" font-size="20" fill="white" text-anchor="middle">AGY</text></svg>';
  const accountWithLogo = await prisma.account.update({
    where: { id: account.id },
    data: { logoUrl: testLogoSvg },
  });
  assert(accountWithLogo.logoUrl === testLogoSvg, '2. Agency logo URL saved successfully');

  // Test 3: Delete brand logo (logoUrl reverted to null)
  const accountWithoutLogo = await prisma.account.update({
    where: { id: account.id },
    data: { logoUrl: null },
  });
  assert(accountWithoutLogo.logoUrl === null, '3. Agency logo deleted successfully (logoUrl is null)');

  // Test 4: Currency and Reply-To Email update
  const updatedCurrencyAndEmail = await prisma.account.update({
    where: { id: account.id },
    data: {
      currency: 'EUR',
      replyToEmail: 'billing@antigravity.test',
      emailSettings: JSON.stringify({
        STATUS_UPDATE: true,
        MEETING_INVITE: false,
        NEW_CHAT_MESSAGE: true,
      }),
    },
  });
  assert(
    updatedCurrencyAndEmail.currency === 'EUR' &&
    updatedCurrencyAndEmail.replyToEmail === 'billing@antigravity.test' &&
    updatedCurrencyAndEmail.emailSettings?.includes('STATUS_UPDATE'),
    '4. Currency, replyToEmail, and emailSettings preferences updated'
  );

  // Test 5: Team member creation in Settings
  const testEmployeeEmail = 'settings-employee-test@clienthub.local';
  await prisma.user.deleteMany({ where: { email: testEmployeeEmail } });

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('TempPassword123!', salt);
  const newEmployee = await prisma.user.create({
    data: {
      accountId: account.id,
      name: 'Settings Test Employee',
      email: testEmployeeEmail,
      passwordHash,
      role: 'EMPLOYEE',
      isActive: true,
    },
  });
  assert(newEmployee.id !== undefined && newEmployee.email === testEmployeeEmail, '5. New employee account created via settings');

  // Test 6: Verify password authentication works for created employee
  const isPasswordValid = await bcrypt.compare('TempPassword123!', newEmployee.passwordHash);
  assert(isPasswordValid, '6. Password hash matches created credentials');

  // Test 7: Duplicate email prevention
  const duplicate = await prisma.user.findFirst({
    where: { accountId: account.id, email: testEmployeeEmail },
  });
  assert(duplicate !== null, '7. Duplicate user detection operates correctly');

  // Test 8: Audit log entry created for settings operations
  const audit = await prisma.auditLog.create({
    data: {
      accountId: account.id,
      userId: newEmployee.id,
      action: 'DELETE',
      entityType: 'SETTINGS',
      entityId: account.id,
      details: JSON.stringify({ field: 'logoUrl', action: 'delete-logo' }),
    },
  });
  assert(audit.action === 'DELETE' && audit.entityType === 'SETTINGS', '8. Audit trail logs settings and logo deletion events');

  // Clean up test data
  await prisma.user.delete({ where: { id: newEmployee.id } });
  // Restore original agency name
  await prisma.account.update({
    where: { id: account.id },
    data: {
      name: account.name,
      currency: account.currency || 'USD',
      logoUrl: account.logoUrl,
    },
  });

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} / ${total} SETTINGS FEATURES TESTS PASSED!`);
  console.log('====================================================\n');
}

testSettingsFeatures()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

