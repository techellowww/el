"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../lib/auth");
const audit_1 = require("../lib/audit");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { role: roleFilter, status: statusFilter } = req.query;
        const whereClause = {};
        if (roleFilter && roleFilter !== 'ALL')
            whereClause.role = roleFilter;
        if (statusFilter === 'active')
            whereClause.isActive = true;
        if (statusFilter === 'inactive')
            whereClause.isActive = false;
        const employees = await prisma_1.prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                name: true,
                employeeId: true,
                role: true,
                department: true,
                phone: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                timeEntries: {
                    where: { isDeleted: false },
                    select: { duration: true, status: true, projectId: true },
                },
                _count: {
                    select: {
                        assignedProjects: true,
                        correctionsRequested: { where: { status: 'PENDING' } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        const activeTimers = await prisma_1.prisma.timeEntry.findMany({
            where: {
                status: 'RUNNING',
                endTime: null,
                isDeleted: false,
            },
            include: {
                project: { select: { code: true, name: true } },
            },
        });
        const activeTimerMap = new Map(activeTimers.map((t) => [t.userId, t]));
        const enrichedEmployees = employees.map((emp) => {
            const totalSeconds = emp.timeEntries.reduce((acc, curr) => acc + curr.duration, 0);
            const activeTimer = activeTimerMap.get(emp.id) || null;
            return {
                id: emp.id,
                email: emp.email,
                name: emp.name,
                employeeId: emp.employeeId,
                role: emp.role,
                department: emp.department,
                phone: emp.phone,
                isActive: emp.isActive,
                createdAt: emp.createdAt,
                totalTrackedSeconds: totalSeconds,
                activeTimer: activeTimer ? {
                    id: activeTimer.id,
                    startTime: activeTimer.startTime,
                    project: activeTimer.project,
                } : null,
                pendingCorrectionsCount: emp._count.correctionsRequested,
                assignedProjectsCount: emp._count.assignedProjects,
            };
        });
        res.json({ employees: enrichedEmployees });
    }
    catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: 'Failed to retrieve employees' });
    }
});
router.post('/', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { email, password, name, employeeId, role = 'EMPLOYEE', department, phone } = req.body;
        if (!email || !password || !name || !employeeId) {
            res.status(400).json({ error: 'Email, Password, Name, and Employee ID are required.' });
            return;
        }
        const cleanPassword = typeof password === 'string' ? password.trim() : '';
        if (cleanPassword.length < 6) {
            res.status(400).json({ error: 'Password must be at least 6 characters long.' });
            return;
        }
        const cleanEmail = email.toLowerCase().trim();
        const cleanEmpId = employeeId.trim().toUpperCase();
        const existingEmail = await prisma_1.prisma.user.findUnique({
            where: { email: cleanEmail },
        });
        if (existingEmail) {
            res.status(400).json({ error: `User with email ${cleanEmail} already exists.` });
            return;
        }
        const existingEmpId = await prisma_1.prisma.user.findUnique({
            where: { employeeId: cleanEmpId },
        });
        if (existingEmpId) {
            res.status(400).json({ error: `Employee ID ${cleanEmpId} already exists.` });
            return;
        }
        const passwordHash = await (0, auth_1.hashPassword)(cleanPassword);
        const newEmployee = await prisma_1.prisma.user.create({
            data: {
                email: cleanEmail,
                passwordHash,
                name: name.trim(),
                employeeId: cleanEmpId,
                role: role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE',
                department: department?.trim() || null,
                phone: phone?.trim() || null,
                isActive: true,
            },
            select: {
                id: true,
                email: true,
                name: true,
                employeeId: true,
                role: true,
                department: true,
                isActive: true,
                createdAt: true,
            },
        });
        await (0, audit_1.logAuditEvent)({
            userId: req.user.id,
            action: 'EMPLOYEE_CREATED',
            targetEntity: 'User',
            targetId: newEmployee.id,
            mandatoryReason: 'Admin registered new employee account',
            details: { email: newEmployee.email, employeeId: newEmployee.employeeId, role: newEmployee.role },
        });
        res.status(201).json({ success: true, employee: newEmployee });
    }
    catch (error) {
        console.error('Error creating employee:', error);
        res.status(500).json({ error: 'Failed to create employee' });
    }
});
router.patch('/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const { name, department, phone, role, isActive, password } = req.body;
        const existing = await prisma_1.prisma.user.findUnique({
            where: { id },
        });
        if (!existing) {
            res.status(404).json({ error: 'Employee not found' });
            return;
        }
        const dataToUpdate = {};
        if (name)
            dataToUpdate.name = name.trim();
        if (department !== undefined)
            dataToUpdate.department = department ? department.trim() : null;
        if (phone !== undefined)
            dataToUpdate.phone = phone ? phone.trim() : null;
        if (role && (role === 'ADMIN' || role === 'EMPLOYEE'))
            dataToUpdate.role = role;
        if (typeof isActive === 'boolean')
            dataToUpdate.isActive = isActive;
        if (password !== undefined && password !== null && String(password).trim() !== '') {
            const cleanPassword = String(password).trim();
            if (cleanPassword.length < 6) {
                res.status(400).json({ error: 'Password must be at least 6 characters long.' });
                return;
            }
            dataToUpdate.passwordHash = await (0, auth_1.hashPassword)(cleanPassword);
        }
        const updated = await prisma_1.prisma.user.update({
            where: { id },
            data: dataToUpdate,
            select: {
                id: true,
                email: true,
                name: true,
                employeeId: true,
                role: true,
                department: true,
                phone: true,
                isActive: true,
                updatedAt: true,
            },
        });
        await (0, audit_1.logAuditEvent)({
            userId: req.user.id,
            action: 'EMPLOYEE_UPDATED',
            targetEntity: 'User',
            targetId: id,
            mandatoryReason: 'Admin updated employee account settings',
            details: {
                employeeId: existing.employeeId,
                changes: Object.keys(dataToUpdate),
                isActive: updated.isActive,
            },
        });
        res.json({ success: true, employee: updated });
    }
    catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ error: 'Failed to update employee' });
    }
});
async function executeEmployeeDeleteOrDeactivate(id, req, res, forcePermanent) {
    try {
        const isPermanent = forcePermanent ??
            (req.query.permanent === 'true' ||
                req.query.mode === 'permanent' ||
                req.body?.permanent === true ||
                req.body?.mode === 'permanent');
        const inputReason = req.query.reason ||
            req.body?.reason ||
            '';
        const cleanReason = inputReason.trim().length >= 3
            ? inputReason.trim()
            : isPermanent
                ? 'Admin requested permanent employee account deletion'
                : 'Admin deactivated employee account';
        const existing = await prisma_1.prisma.user.findUnique({
            where: { id },
        });
        if (!existing) {
            res.status(404).json({ error: 'Employee not found' });
            return;
        }
        if (existing.id === req.user.id) {
            res.status(400).json({ error: 'Cannot deactivate or delete your own administrative account.' });
            return;
        }
        if (isPermanent) {
            await prisma_1.prisma.$transaction(async (tx) => {
                // 1. Reassign projects created by this user to current admin so FK constraint is satisfied
                await tx.project.updateMany({
                    where: { createdById: id },
                    data: { createdById: req.user.id },
                });
                // 2. Clear reviewer ID on any corrections reviewed by this user
                await tx.timeCorrectionRequest.updateMany({
                    where: { reviewedById: id },
                    data: { reviewedById: null },
                });
                // 3. Delete time corrections requested by this user
                await tx.timeCorrectionRequest.deleteMany({
                    where: { userId: id },
                });
                // 4. Delete screenshots captured for this user
                await tx.screenshotRecord.deleteMany({
                    where: { userId: id },
                });
                // 5. Delete time entries for this user
                await tx.timeEntry.deleteMany({
                    where: { userId: id },
                });
                // 6. Delete project assignments for this user
                await tx.projectAssignment.deleteMany({
                    where: { userId: id },
                });
                // 7. Nullify userId in audit logs
                await tx.auditLog.updateMany({
                    where: { userId: id },
                    data: { userId: null },
                });
                // 8. Finally delete the user
                await tx.user.delete({
                    where: { id },
                });
            });
            await (0, audit_1.logAuditEvent)({
                userId: req.user.id,
                action: 'EMPLOYEE_PERMANENTLY_DELETED',
                targetEntity: 'User',
                targetId: id,
                mandatoryReason: cleanReason,
                details: {
                    employeeId: existing.employeeId,
                    email: existing.email,
                    name: existing.name,
                    department: existing.department,
                    permanent: true,
                },
            });
            res.json({
                success: true,
                message: `Employee ${existing.name} (${existing.employeeId}) permanently deleted successfully.`,
            });
            return;
        }
        // Otherwise, perform soft delete / deactivation
        await prisma_1.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id },
                data: { isActive: false },
            });
            const now = new Date();
            const running = await tx.timeEntry.findMany({
                where: { userId: id, status: 'RUNNING', endTime: null },
            });
            for (const r of running) {
                const dur = Math.max(0, Math.round((now.getTime() - r.startTime.getTime()) / 1000));
                await tx.timeEntry.update({
                    where: { id: r.id },
                    data: { endTime: now, duration: dur, status: 'STOPPED' },
                });
            }
        });
        await (0, audit_1.logAuditEvent)({
            userId: req.user.id,
            action: 'EMPLOYEE_DEACTIVATED',
            targetEntity: 'User',
            targetId: id,
            mandatoryReason: cleanReason,
            details: {
                employeeId: existing.employeeId,
                email: existing.email,
                name: existing.name,
            },
        });
        res.json({
            success: true,
            message: `Employee account ${existing.name} deactivated successfully.`,
        });
    }
    catch (error) {
        console.error('Error in employee delete/deactivate:', error);
        res.status(500).json({ error: 'Failed to process employee deletion or deactivation' });
    }
}
router.delete('/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    await executeEmployeeDeleteOrDeactivate(req.params.id, req, res);
});
router.post('/:id/delete', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    await executeEmployeeDeleteOrDeactivate(req.params.id, req, res);
});
exports.default = router;
