import { prisma } from './prisma';

export async function logAuditEvent({
  userId,
  action,
  targetEntity,
  targetId,
  mandatoryReason,
  details,
  ipAddress,
}: {
  userId?: string | null;
  action: string;
  targetEntity: string;
  targetId: string;
  mandatoryReason?: string | null;
  details?: Record<string, unknown> | string | null;
  ipAddress?: string | null;
}) {
  try {
    const detailsString = typeof details === 'object' && details !== null ? JSON.stringify(details) : (details as string | null);

    return await prisma.auditLog.create({
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
  } catch (err) {
    console.error('Failed to log audit event:', err);
    return null;
  }
}
