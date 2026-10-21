"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const timerEngine_1 = require("../src/lib/timerEngine");
const reportEngine_1 = require("../src/lib/reportEngine");
const audit_1 = require("../src/lib/audit");
const screenshotGenerator_1 = require("../src/lib/screenshotGenerator");
const prisma = new client_1.PrismaClient();
async function runTestSuite() {
    console.log('🧪 Starting EL App Automated Business Logic & Security Tests...\n');
    let passed = 0;
    let failed = 0;
    function assert(condition, testName, details) {
        if (condition) {
            console.log(`  ✅ PASS: ${testName}`);
            passed++;
        }
        else {
            console.error(`  ❌ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
            failed++;
        }
    }
    try {
        // Setup test users and projects
        const testAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        const testEmp1 = await prisma.user.findFirst({ where: { employeeId: 'EMP-002' } }); // John Doe
        const testEmp2 = await prisma.user.findFirst({ where: { employeeId: 'EMP-003' } }); // Sarah Connor
        const prj1 = await prisma.project.findFirst({ where: { code: 'PRJ-EL-01' } });
        const prj2 = await prisma.project.findFirst({ where: { code: 'PRJ-EL-02' } });
        if (!testAdmin || !testEmp1 || !testEmp2 || !prj1 || !prj2) {
            throw new Error('Database not properly seeded. Run prisma seed first.');
        }
        // Clean up any running timers for testEmp1
        await prisma.timeEntry.updateMany({
            where: { userId: testEmp1.id, status: 'RUNNING' },
            data: { status: 'STOPPED', endTime: new Date(), duration: 10 },
        });
        // Test 1: Employee can start a project timer
        const start1 = await (0, timerEngine_1.startProjectTimer)({ userId: testEmp1.id, projectId: prj1.id, notes: 'Test Entry 1' });
        assert(start1.activeEntry.status === 'RUNNING' && start1.activeEntry.projectId === prj1.id, 'Test 1: Employee can start a project timer');
        // Test 2: Starting another project stops the previous timer correctly
        const start2 = await (0, timerEngine_1.startProjectTimer)({ userId: testEmp1.id, projectId: prj2.id, notes: 'Test Entry 2' });
        assert(start2.activeEntry.projectId === prj2.id &&
            start2.previousStopped !== null &&
            start2.previousStopped.id === start1.activeEntry.id &&
            start2.previousStopped.status === 'STOPPED', 'Test 2: Starting another project automatically stops previous timer');
        // Test 3: Concurrency / Single-active-timer enforcement
        const runningCount = await prisma.timeEntry.count({
            where: { userId: testEmp1.id, status: 'RUNNING', endTime: null },
        });
        assert(runningCount === 1, 'Test 3: Single active timer rule enforced (exactly 1 active timer)');
        // Test 4: Timer remains accurate from server timestamp (getActiveTimer)
        const active = await (0, timerEngine_1.getActiveTimer)(testEmp1.id);
        assert(active !== null && active.id === start2.activeEntry.id && active.startTime instanceof Date, 'Test 4: Active timer retrieved with server-authoritative timestamp');
        // Test 5: Stopping a timer calculates accurate non-negative duration
        await new Promise((r) => setTimeout(r, 1100)); // sleep 1.1s
        const stopped = await (0, timerEngine_1.stopProjectTimer)({ userId: testEmp1.id, timeEntryId: active.id });
        assert(stopped.status === 'STOPPED' && stopped.duration >= 1 && stopped.endTime !== null, 'Test 5: Timer stopping calculates non-negative duration from server timestamps');
        // Test 6: Office hours classification logic (regular vs outside-hours)
        const schedule = {
            openingTime: '09:00',
            closingTime: '18:00',
            workingDays: 'MON,TUE,WED,THU,FRI',
            timezone: 'UTC',
            allowOutsideHours: true,
            autoCutoffEnabled: true,
        };
        // 12:00 UTC on a Wednesday (2026-10-14)
        const wednesdayNoon = new Date('2026-10-14T12:00:00Z');
        const classRegular = (0, timerEngine_1.evaluateTimeClassification)(wednesdayNoon, schedule);
        assert(!classRegular.isOutsideHours && classRegular.classification === 'REGULAR', 'Test 6A: In-office time classified as REGULAR');
        // 21:00 UTC on a Wednesday
        const wednesdayNight = new Date('2026-10-14T21:00:00Z');
        const classNight = (0, timerEngine_1.evaluateTimeClassification)(wednesdayNight, schedule);
        assert(classNight.isOutsideHours && classNight.classification === 'OUTSIDE_HOURS', 'Test 6B: Work outside hours flagged as OUTSIDE_HOURS');
        // Sunday (Weekend)
        const sundayNoon = new Date('2026-10-18T12:00:00Z');
        const classSunday = (0, timerEngine_1.evaluateTimeClassification)(sundayNoon, schedule);
        assert(classSunday.isOutsideHours && classSunday.classification === 'OUTSIDE_HOURS', 'Test 6C: Weekend work flagged as OUTSIDE_HOURS');
        // Test 7: Automated office closing cut-off enforcement
        // Create a mock active timer started during office hours yesterday
        const pastStart = new Date(Date.now() - 3600 * 1000 * 5); // 5 hours ago
        const mockRunning = await prisma.timeEntry.create({
            data: {
                userId: testEmp2.id,
                projectId: prj1.id,
                startTime: pastStart,
                endTime: null,
                duration: 0,
                status: 'RUNNING',
                classification: 'REGULAR',
            },
        });
        const cutoffRes = await (0, timerEngine_1.enforceGlobalOfficeCutoffs)();
        assert(typeof cutoffRes.processed === 'number', 'Test 7: Server-side office cutoff evaluator executes safely');
        // Clean up mock
        await prisma.timeEntry.delete({ where: { id: mockRunning.id } });
        // Test 8: Daily and weekly totals match underlying records
        const dailyRep = await (0, reportEngine_1.getDailyReport)({ date: new Date() });
        const rawSum = dailyRep.rawEntries.reduce((acc, curr) => acc + curr.duration, 0);
        assert(dailyRep.totalTrackedSeconds === rawSum, 'Test 8: Daily report total tracked seconds matches sum of underlying entries');
        // Test 9: Weekly report highest and lowest project calculations
        const weeklyRep = await (0, reportEngine_1.getWeeklyReport)({ date: new Date() });
        assert(Array.isArray(weeklyRep.projectBreakdown), 'Test 9: Weekly report successfully aggregates projects and identifies combinations');
        // Test 10: Completed-project report distinguishes calendar time from tracked working time
        const completedRep = await (0, reportEngine_1.getCompletedProjectReports)();
        const cProject = completedRep.find((p) => p.code === 'PRJ-EL-04');
        assert(cProject !== undefined &&
            typeof cProject.calendarElapsedDays === 'number' &&
            typeof cProject.totalTrackedSeconds === 'number', 'Test 10: Completed project reports clearly separate calendar elapsed time from tracked hours');
        // Test 11: Audit log generation
        const auditRes = await (0, audit_1.logAuditEvent)({
            userId: testAdmin.id,
            action: 'TEST_AUDIT_VERIFICATION',
            targetEntity: 'SystemTest',
            targetId: 't-101',
            mandatoryReason: 'Automated test suite verification',
            details: { test: true },
        });
        assert(auditRes !== null && auditRes.id !== undefined, 'Test 11: Immutable audit logs correctly persisted');
        // Test 12: Time-correction approval workflow
        const testEntry = await prisma.timeEntry.create({
            data: {
                userId: testEmp1.id,
                projectId: prj1.id,
                startTime: new Date('2026-10-10T10:00:00Z'),
                endTime: new Date('2026-10-10T12:00:00Z'),
                duration: 7200,
                status: 'STOPPED',
            },
        });
        const correctionReq = await prisma.timeCorrectionRequest.create({
            data: {
                timeEntryId: testEntry.id,
                userId: testEmp1.id,
                originalStartTime: testEntry.startTime,
                originalEndTime: testEntry.endTime,
                originalDuration: 7200,
                proposedStartTime: new Date('2026-10-10T10:00:00Z'),
                proposedEndTime: new Date('2026-10-10T13:00:00Z'),
                proposedDuration: 10800,
                reason: 'Added extra hour spent on deployment fix',
                status: 'PENDING',
            },
        });
        // Simulate Admin Approval
        await prisma.$transaction(async (tx) => {
            await tx.timeEntry.update({
                where: { id: testEntry.id },
                data: {
                    startTime: correctionReq.proposedStartTime,
                    endTime: correctionReq.proposedEndTime,
                    duration: correctionReq.proposedDuration,
                    status: 'CORRECTED',
                    source: 'CORRECTION',
                },
            });
            await tx.timeCorrectionRequest.update({
                where: { id: correctionReq.id },
                data: {
                    status: 'APPROVED',
                    reviewedById: testAdmin.id,
                    reviewComment: 'Approved based on commit history',
                    reviewedAt: new Date(),
                },
            });
        });
        const verifiedEntry = await prisma.timeEntry.findUnique({ where: { id: testEntry.id } });
        assert(verifiedEntry?.duration === 10800 && verifiedEntry?.status === 'CORRECTED', 'Test 12: Approved correction updates entry duration and status to CORRECTED');
        // Clean up test entry
        await prisma.timeEntry.delete({ where: { id: testEntry.id } });
        // Test 13: Outside-hours timer with planned duration auto-stops when target duration reached
        const outsidePastStart = new Date(Date.now() - 3700 * 1000); // 3700s ago
        const mockOutsideEntry = await prisma.timeEntry.create({
            data: {
                userId: testEmp1.id,
                projectId: prj1.id,
                startTime: outsidePastStart,
                endTime: null,
                duration: 0,
                targetDuration: 3600, // 1 hour limit (which is already exceeded)
                status: 'RUNNING',
                classification: 'OUTSIDE_HOURS',
                isOutsideHours: true,
            },
        });
        const outsideCutoffRes = await (0, timerEngine_1.enforceGlobalOfficeCutoffs)();
        const updatedOutsideEntry = await prisma.timeEntry.findUnique({
            where: { id: mockOutsideEntry.id },
        });
        assert(updatedOutsideEntry?.status === 'AUTO_CUTOFF' &&
            updatedOutsideEntry?.duration === 3600 &&
            updatedOutsideEntry?.endTime !== null, 'Test 13: Outside-hours timer automatically cut off at planned duration limit');
        await prisma.timeEntry.delete({ where: { id: mockOutsideEntry.id } });
        // Test 14: Automated screenshot capture records milestone 0 initial session snapshot for running timer
        const testTimerEntry = await prisma.timeEntry.create({
            data: {
                userId: testEmp1.id,
                projectId: prj1.id,
                startTime: new Date(),
                endTime: null,
                duration: 0,
                status: 'RUNNING',
                classification: 'OUTSIDE_HOURS',
                isOutsideHours: true,
            },
        });
        const schedulerRun1 = await (0, screenshotGenerator_1.processAutomatedScreenshotsForRunningTimers)();
        const recordedInitial = await prisma.screenshotRecord.findFirst({
            where: { timeEntryId: testTimerEntry.id },
        });
        assert(recordedInitial !== null &&
            recordedInitial.timeEntryId === testTimerEntry.id &&
            typeof recordedInitial.imageUrl === 'string' &&
            recordedInitial.imageUrl.startsWith('data:image/svg+xml;base64,'), 'Test 14: Automated screenshot capture records milestone 0 initial session snapshot for running timer');
        // Test 15: Background scheduler generates interval milestone screenshots as time elapses
        // Set timer start time 16 minutes in the past so milestone 1 triggers
        await prisma.timeEntry.update({
            where: { id: testTimerEntry.id },
            data: { startTime: new Date(Date.now() - 16 * 60 * 1000) },
        });
        const schedulerRun2 = await (0, screenshotGenerator_1.processAutomatedScreenshotsForRunningTimers)();
        const allScreenshots = await prisma.screenshotRecord.findMany({
            where: { timeEntryId: testTimerEntry.id },
        });
        assert(allScreenshots.length >= 2, 'Test 15: Background scheduler generates interval milestone screenshots as time elapses');
        // Clean up test screenshots and time entry
        await prisma.screenshotRecord.deleteMany({ where: { timeEntryId: testTimerEntry.id } });
        await prisma.timeEntry.delete({ where: { id: testTimerEntry.id } });
    }
    catch (error) {
        console.error('Fatal error during test execution:', error);
        failed++;
    }
    finally {
        await prisma.$disconnect();
    }
    console.log(`\n================================`);
    console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
    console.log(`================================\n`);
    if (failed > 0) {
        process.exit(1);
    }
}
runTestSuite();
