"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEvent = logAuditEvent;
const prisma_1 = require("./prisma");
async function logAuditEvent({ userId, action, targetEntity, targetId, mandatoryReason, details, ipAddress, }) {
    try {
        const detailsString = typeof details === 'object' && details !== null ? JSON.stringify(details) : details;
        return await prisma_1.prisma.auditLog.create({
            data: {
                userId: userId || null,
                action,
                targetEntity,
                targetId,
                mandatoryReason: mandatoryReason || null,
                details: detailsString || null,
                ipAddress: ipAddress || null,
            },
        });
    }
    catch (err) {
        console.error('Failed to log audit event:', err);
        return null;
    }
}
