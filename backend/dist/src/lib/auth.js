"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
exports.authenticate = authenticate;
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("./prisma");
const JWT_SECRET = process.env.JWT_SECRET || 'el_app_super_secure_jwt_secret_key_2026_xyz_production_ready';
async function hashPassword(password) {
    return bcryptjs_1.default.hash(password, 10);
}
async function verifyPassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
function generateToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
}
async function authenticate(req, res, next) {
    let token;
    // 1. Check cookies
    if (req.cookies && req.cookies.el_token) {
        token = req.cookies.el_token;
    }
    // 2. Check Authorization Bearer header
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.substring(7);
    }
    if (!token) {
        res.status(401).json({ error: 'Unauthorized: Authentication required' });
        return;
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
        return;
    }
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, name: true, role: true, employeeId: true, isActive: true, department: true },
    });
    if (!user || !user.isActive) {
        res.status(403).json({ error: 'Forbidden: Account deactivated or not found' });
        return;
    }
    req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        employeeId: user.employeeId,
        department: user.department,
    };
    next();
}
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Forbidden: Administrative privilege required' });
        return;
    }
    next();
}
