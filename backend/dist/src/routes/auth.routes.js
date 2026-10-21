"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../lib/auth");
const audit_1 = require("../lib/audit");
const router = (0, express_1.Router)();
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() },
        });
        if (!user) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }
        if (!user.isActive) {
            res.status(403).json({ error: 'Your account has been deactivated. Please contact an administrator.' });
            return;
        }
        const isMatch = await (0, auth_1.verifyPassword)(password, user.passwordHash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }
        const payload = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            employeeId: user.employeeId,
            department: user.department,
        };
        const token = (0, auth_1.generateToken)(payload);
        await (0, audit_1.logAuditEvent)({
            userId: user.id,
            action: 'USER_LOGIN',
            targetEntity: 'User',
            targetId: user.id,
            mandatoryReason: 'User authenticated successfully',
            details: { email: user.email, role: user.role },
            ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
        });
        res.cookie('el_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.json({
            success: true,
            user: payload,
            token,
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'An unexpected server error occurred during login.' });
    }
});
router.post('/logout', async (req, res) => {
    const token = req.cookies?.el_token;
    if (token) {
        res.clearCookie('el_token', { path: '/' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
});
router.get('/me', auth_1.authenticate, async (req, res) => {
    res.json({ user: req.user });
});
exports.default = router;
