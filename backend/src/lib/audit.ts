import { prisma } from './prisma';

export async function logAuditEvent({
  userId,
  accountId,
  action,
  targetEntity,
  targetId,
  entityType,
  entityId,
  mandatoryReason,
  details,
  ipAddress,
}: {
  userId?: string | null;
  accountId?: string | null;
  action: string;
  targetEntity?: string;
  targetId?: string;
  entityType?: string;
  entityId?: string;
  mandatoryReason?: string | null;
  details?: Record<string, unknown> | string | null;
  ipAddress?: string | null;
}) {
  try {
    const detailsString =
      typeof details === 'object' && details !== null
        ? JSON.stringify(details)
        : (details as string | null);

    let effectiveAccountId = accountId;
    if (!effectiveAccountId && userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { accountId: true },
      });
      effectiveAccountId = user?.accountId || null;
    }

    if (!effectiveAccountId) {
      const firstAccount = await prisma.account.findFirst({ select: { id: true } });
      effectiveAccountId = firstAccount?.id || 'account-alpha';
    }

    return await prisma.auditLog.create({
      data: {
        accountId: effectiveAccountId,
        userId: userId || null,
        action,
        entityType: entityType || targetEntity || 'GENERAL',
        entityId: entityId || targetId || 'system',
        details: detailsString || mandatoryReason || null,
        ipAddress: ipAddress || null,
      },
    });
  } catch (err) {
    console.error('Failed to log audit event:', err);
    return null;
  }
}
