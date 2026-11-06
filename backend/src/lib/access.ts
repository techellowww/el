import { prisma } from "./prisma";
import { hashToken } from "./token";

export interface SessionPayload {
  userId: string;
  accountId: string;
  email: string;
  name: string;
  role: "ADMIN" | "EMPLOYEE";
}

export class NotFoundError extends Error {
  statusCode: number = 404;
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  statusCode: number = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Section 3 Rule:
 * Check client assignment in ONE shared place, so no page forgets it.
 * If an Employee asks for a client that is not theirs, return 404.
 * Never reveal that an unauthorized client exists.
 */
export async function requireClientAccess(user: SessionPayload, clientId: string) {
  // 1. Fetch client ensuring account scoping
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      accountId: user.accountId,
    },
    include: {
      account: {
        select: { id: true, name: true, currency: true, logoUrl: true },
      },
    },
  });

  if (!client || client.company === "__INTERNAL_GENERAL_TEAM__") {
    throw new NotFoundError("Client not found");
  }

  // 2. If employee, verify client assignment
  if (user.role === "EMPLOYEE") {
    const assignment = await prisma.clientAssignment.findUnique({
      where: {
        clientId_userId: {
          clientId: client.id,
          userId: user.userId,
        },
      },
    });

    if (!assignment) {
      // Must return 404, never 403, to prevent client ID enumeration
      throw new NotFoundError("Client not found");
    }
  }

  return client;
}

/**
 * Section 3 Rule:
 * Employees have NO access to proposals, invoices or settings.
 */
export function requireAdmin(user: SessionPayload) {
  if (user.role !== "ADMIN") {
    throw new ForbiddenError("Admin access required");
  }
}

/**
 * Section 6 Rule:
 * Client links use a long random token. Store only a hash of it.
 * Refuse wrong, expired or guessed links with 404.
 */
export async function getClientByPortalToken(rawToken: string) {
  if (!rawToken || typeof rawToken !== "string") {
    throw new NotFoundError("Invalid or missing portal token");
  }

  const tokenHash = hashToken(rawToken);

  const client = await prisma.client.findFirst({
    where: {
      portalTokenHash: tokenHash,
    },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          currency: true,
          logoUrl: true,
        },
      },
      projects: {
        orderBy: { createdAt: "desc" },
        include: {
          statusUpdates: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!client) {
    throw new NotFoundError("Invalid or expired portal link");
  }

  if (client.portalTokenExpiresAt && client.portalTokenExpiresAt < new Date()) {
    throw new NotFoundError("Portal link has expired");
  }

  return client;
}

/**
 * Get all clients accessible to the current user in their account
 */
export async function getAccessibleClients(user: SessionPayload) {
  if (user.role === "ADMIN") {
    return prisma.client.findMany({
      where: {
        accountId: user.accountId,
        NOT: { company: "__INTERNAL_GENERAL_TEAM__" },
      },
      orderBy: { name: "asc" },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        projects: {
          select: { id: true, name: true, stage: true },
        },
      },
    });
  }

  // Employee only sees assigned clients
  return prisma.client.findMany({
    where: {
      accountId: user.accountId,
      NOT: { company: "__INTERNAL_GENERAL_TEAM__" },
      assignments: {
        some: {
          userId: user.userId,
        },
      },
    },
    orderBy: { name: "asc" },
    include: {
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      projects: {
        select: { id: true, name: true, stage: true },
      },
    },
  });
}

