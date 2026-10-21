"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Starting EL App database seeding...');
    // 1. Password hash
    const defaultPasswordHash = await bcryptjs_1.default.hash('Password@123', 10);
    // 2. Create Admin User
    const admin = await prisma.user.upsert({
        where: { email: 'ellowwwstudio@gmail.com' },
        update: { passwordHash: defaultPasswordHash },
        create: {
            email: 'ellowwwstudio@gmail.com',
            passwordHash: defaultPasswordHash,
            name: 'System Administrator',
            employeeId: 'EMP-001',
            role: 'ADMIN',
            department: 'Management',
            phone: '+1 555-0100',
            isActive: true,
        },
    });
    // 3. Create Employees
    const emp1 = await prisma.user.upsert({
        where: { email: 'john.doe@elapp.local' },
        update: { passwordHash: defaultPasswordHash },
        create: {
            email: 'john.doe@elapp.local',
            passwordHash: defaultPasswordHash,
            name: 'John Doe',
            employeeId: 'EMP-002',
            role: 'EMPLOYEE',
            department: 'Engineering',
            phone: '+1 555-0101',
            isActive: true,
        },
    });
    const emp2 = await prisma.user.upsert({
        where: { email: 'sarah.connor@elapp.local' },
        update: { passwordHash: defaultPasswordHash },
        create: {
            email: 'sarah.connor@elapp.local',
            passwordHash: defaultPasswordHash,
            name: 'Sarah Connor',
            employeeId: 'EMP-003',
            role: 'EMPLOYEE',
            department: 'Product Design',
            phone: '+1 555-0102',
            isActive: true,
        },
    });
    const emp3 = await prisma.user.upsert({
        where: { email: 'alex.miller@elapp.local' },
        update: { passwordHash: defaultPasswordHash },
        create: {
            email: 'alex.miller@elapp.local',
            passwordHash: defaultPasswordHash,
            name: 'Alex Miller',
            employeeId: 'EMP-004',
            role: 'EMPLOYEE',
            department: 'Quality Assurance',
            phone: '+1 555-0103',
            isActive: true,
        },
    });
    // 4. Default Office Schedule
    await prisma.officeSchedule.upsert({
        where: { id: 'default-schedule' },
        update: {},
        create: {
            id: 'default-schedule',
            openingTime: '09:00',
            closingTime: '18:00',
            workingDays: 'MON,TUE,WED,THU,FRI',
            timezone: 'Asia/Kolkata',
            allowOutsideHours: true,
            autoCutoffEnabled: true,
            updatedById: admin.id,
        },
    });
    // 5. Default Settings
    await prisma.screenshotSetting.upsert({
        where: { id: 'default-screenshot-setting' },
        update: {},
        create: {
            id: 'default-screenshot-setting',
            enabled: false,
            intervalMinutes: 60,
            requireConsent: true,
            consentNotice: 'Notice: Activity screenshots are recorded periodically during active project timers for verification. All captures are securely stored with restricted administrative access.',
        },
    });
    await prisma.emailScheduleSetting.upsert({
        where: { id: 'default-email-setting' },
        update: {},
        create: {
            id: 'default-email-setting',
            enabled: true,
            dailyEnabled: true,
            dailyTime: '19:00',
            weeklyEnabled: true,
            weeklyDay: 'FRI',
            weeklyTime: '18:00',
            recipients: 'ellowwwstudio@gmail.com',
            timezone: 'Asia/Kolkata',
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpUser: 'ellowwwstudio@gmail.com',
            smtpPass: 'nzdnnzaczosljhzh',
            smtpFrom: 'EL App Notifications <ellowwwstudio@gmail.com>',
        },
    });
    // 6. Projects
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const prj1 = await prisma.project.upsert({
        where: { code: 'PRJ-EL-01' },
        update: {},
        create: {
            code: 'PRJ-EL-01',
            name: 'Internal Core Platform',
            description: 'Core backend services, microservices architecture, and real-time event pipeline.',
            status: 'ACTIVE',
            startDate: thirtyDaysAgo,
            createdById: admin.id,
        },
    });
    const prj2 = await prisma.project.upsert({
        where: { code: 'PRJ-EL-02' },
        update: {},
        create: {
            code: 'PRJ-EL-02',
            name: 'Client Portal Redesign',
            description: 'Next.js client interface with modern dashboards, time cards, and PDF report exports.',
            status: 'ACTIVE',
            startDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
            createdById: admin.id,
        },
    });
    const prj3 = await prisma.project.upsert({
        where: { code: 'PRJ-EL-03' },
        update: {},
        create: {
            code: 'PRJ-EL-03',
            name: 'Mobile API Integration',
            description: 'REST and WebSocket endpoints for mobile time tracking clients.',
            status: 'ACTIVE',
            startDate: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
            createdById: admin.id,
        },
    });
    const prj4 = await prisma.project.upsert({
        where: { code: 'PRJ-EL-04' },
        update: {
            status: 'COMPLETED',
            closureDate: fiveDaysAgo,
        },
        create: {
            code: 'PRJ-EL-04',
            name: 'Legacy CRM Migration',
            description: 'Complete data migration from older CRM to unified warehouse.',
            status: 'COMPLETED',
            startDate: thirtyDaysAgo,
            closureDate: fiveDaysAgo,
            createdById: admin.id,
        },
    });
    // 7. Project Assignments
    const assignments = [
        { projectId: prj1.id, userId: emp1.id },
        { projectId: prj1.id, userId: emp2.id },
        { projectId: prj1.id, userId: emp3.id },
        { projectId: prj2.id, userId: emp1.id },
        { projectId: prj2.id, userId: emp2.id },
        { projectId: prj3.id, userId: emp1.id },
        { projectId: prj3.id, userId: emp3.id },
        { projectId: prj4.id, userId: emp1.id },
        { projectId: prj4.id, userId: emp2.id },
    ];
    for (const a of assignments) {
        await prisma.projectAssignment.upsert({
            where: { projectId_userId: { projectId: a.projectId, userId: a.userId } },
            update: {},
            create: a,
        });
    }
    // 8. Historical Time Entries (Realistic data for reporting and analytics)
    const existingEntriesCount = await prisma.timeEntry.count();
    if (existingEntriesCount === 0) {
        console.log('Adding sample time records...');
        // Yesterday: John Doe regular
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const startYest1 = new Date(yesterday.setHours(9, 30, 0, 0));
        const endYest1 = new Date(yesterday.setHours(13, 30, 0, 0));
        const durYest1 = Math.round((endYest1.getTime() - startYest1.getTime()) / 1000);
        const startYest2 = new Date(yesterday.setHours(14, 30, 0, 0));
        const endYest2 = new Date(yesterday.setHours(18, 0, 0, 0));
        const durYest2 = Math.round((endYest2.getTime() - startYest2.getTime()) / 1000);
        await prisma.timeEntry.create({
            data: {
                userId: emp1.id,
                projectId: prj1.id,
                startTime: startYest1,
                endTime: endYest1,
                duration: durYest1,
                status: 'STOPPED',
                classification: 'REGULAR',
                source: 'TIMER',
                notes: 'API schema design and Prisma model definition',
            },
        });
        const entryToCorrect = await prisma.timeEntry.create({
            data: {
                userId: emp1.id,
                projectId: prj2.id,
                startTime: startYest2,
                endTime: endYest2,
                duration: durYest2,
                status: 'STOPPED',
                classification: 'REGULAR',
                source: 'TIMER',
                notes: 'Component styling and state integration',
            },
        });
        // Create a pending correction request for entryToCorrect
        const proposedStart = new Date(yesterday.setHours(14, 0, 0, 0));
        const proposedEnd = new Date(yesterday.setHours(18, 0, 0, 0));
        await prisma.timeCorrectionRequest.create({
            data: {
                timeEntryId: entryToCorrect.id,
                userId: emp1.id,
                originalStartTime: startYest2,
                originalEndTime: endYest2,
                originalDuration: durYest2,
                proposedStartTime: proposedStart,
                proposedEndTime: proposedEnd,
                proposedDuration: Math.round((proposedEnd.getTime() - proposedStart.getTime()) / 1000),
                reason: 'Forgot to start timer immediately after lunch break at 2:00 PM.',
                status: 'PENDING',
            },
        });
        // Outside-hours record for Sarah (requiring review)
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        const startLate = new Date(twoDaysAgo.setHours(19, 0, 0, 0));
        const endLate = new Date(twoDaysAgo.setHours(21, 30, 0, 0));
        const durLate = Math.round((endLate.getTime() - startLate.getTime()) / 1000);
        await prisma.timeEntry.create({
            data: {
                userId: emp2.id,
                projectId: prj2.id,
                startTime: startLate,
                endTime: endLate,
                duration: durLate,
                status: 'STOPPED',
                classification: 'OUTSIDE_HOURS',
                isOutsideHours: true,
                needsReview: true,
                reviewReason: 'Tracked between 19:00 and 21:30 outside standard office closing time (18:00).',
                source: 'TIMER',
                notes: 'Critical UX review and client demo prep',
            },
        });
        // Today entries for John Doe
        const todayMorning = new Date();
        todayMorning.setHours(9, 15, 0, 0);
        const todayNoon = new Date();
        todayNoon.setHours(12, 45, 0, 0);
        await prisma.timeEntry.create({
            data: {
                userId: emp1.id,
                projectId: prj1.id,
                startTime: todayMorning,
                endTime: todayNoon,
                duration: Math.round((todayNoon.getTime() - todayMorning.getTime()) / 1000),
                status: 'STOPPED',
                classification: 'REGULAR',
                source: 'TIMER',
                notes: 'Timer business engine refactoring',
            },
        });
        // Completed project historical entries for PRJ-EL-04
        const migrationStart = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
        migrationStart.setHours(10, 0, 0, 0);
        const migrationEnd = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
        migrationEnd.setHours(17, 0, 0, 0);
        await prisma.timeEntry.create({
            data: {
                userId: emp3.id,
                projectId: prj4.id,
                startTime: migrationStart,
                endTime: migrationEnd,
                duration: 7 * 3600,
                status: 'STOPPED',
                classification: 'REGULAR',
                source: 'TIMER',
                notes: 'Database migration and validation script execution',
            },
        });
        // Audit logs
        await prisma.auditLog.create({
            data: {
                userId: admin.id,
                action: 'SYSTEM_INITIALIZATION',
                targetEntity: 'System',
                targetId: 'root',
                mandatoryReason: 'Initial setup of EL App with standard security policies and office schedules.',
                details: JSON.stringify({ version: '1.0.0', initializedAt: new Date().toISOString() }),
            },
        });
    }
    console.log('✅ Seeding completed successfully!');
    console.log('Default credentials:');
    console.log('Admin:    ellowwwstudio@gmail.com / Password@123');
    console.log('Employee: john.doe@elapp.local / Password@123');
    console.log('Employee: sarah.connor@elapp.local / Password@123');
    console.log('Employee: alex.miller@elapp.local / Password@123');
}
main()
    .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
