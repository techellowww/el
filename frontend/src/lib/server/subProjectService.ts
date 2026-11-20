import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export interface SubProject {
  id: string;
  projectId: string;
  accountId: string;
  name: string;
  description: string | null;
  stage: string;
  budgetHours: number | null;
  createdAt: string;
  updatedAt: string;
}

let tableInitialized = true;

/**
 * Initializes the ch_sub_projects table and indexes if they do not exist.
 * Uses raw PostgreSQL DDL so it never conflicts with Prisma code generation.
 */
export async function ensureSubProjectsTableExists(): Promise<void> {
  // Table is already defined in Prisma schema and migrated.
  return;
}

/**
 * Retrieves all sub-projects belonging to a specific project.
 */
export async function getSubProjectsByProject(projectId: string): Promise<SubProject[]> {
  try {
    const subProjects = await prisma.subProject.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    return subProjects.map((sp: any) => ({
      id: sp.id,
      projectId: sp.projectId,
      accountId: sp.accountId,
      name: sp.name,
      description: sp.description,
      stage: sp.stage,
      budgetHours: sp.budgetHours !== null ? Number(sp.budgetHours) : null,
      createdAt: sp.createdAt instanceof Date ? sp.createdAt.toISOString() : String(sp.createdAt),
      updatedAt: sp.updatedAt instanceof Date ? sp.updatedAt.toISOString() : String(sp.updatedAt),
    }));
  } catch (err: any) {
    console.error(`[SubProjectService] Error fetching subprojects for ${projectId}:`, err?.message);
    return [];
  }
}

/**
 * Retrieves sub-projects for multiple projects in a single batch query.
 */
export async function getSubProjectsForProjects(
  projectIds: string[]
): Promise<Record<string, SubProject[]>> {
  if (!projectIds || projectIds.length === 0) return {};

  const result: Record<string, SubProject[]> = {};
  for (const pid of projectIds) {
    result[pid] = [];
  }

  try {
    const subProjects = await prisma.subProject.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { createdAt: 'asc' },
    });

    for (const sp of subProjects) {
      if (result[sp.projectId]) {
        result[sp.projectId].push({
          id: sp.id,
          projectId: sp.projectId,
          accountId: sp.accountId,
          name: sp.name,
          description: sp.description,
          stage: sp.stage,
          budgetHours: sp.budgetHours !== null ? Number(sp.budgetHours) : null,
          createdAt: sp.createdAt instanceof Date ? sp.createdAt.toISOString() : String(sp.createdAt),
          updatedAt: sp.updatedAt instanceof Date ? sp.updatedAt.toISOString() : String(sp.updatedAt),
        });
      }
    }

    return result;
  } catch (err: any) {
    console.error('[SubProjectService] Error batch fetching subprojects:', err?.message);
    return result;
  }
}

/**
 * Creates a new sub-project within a project.
 */
export async function createSubProject(data: {
  projectId: string;
  accountId: string;
  name: string;
  description?: string | null;
  stage?: string;
  budgetHours?: number | null;
}): Promise<SubProject> {
  await ensureSubProjectsTableExists();

  const id = crypto.randomUUID();
  const name = data.name.trim();
  const description = data.description?.trim() || null;
  const stage = data.stage?.trim() || 'IN_PROGRESS';
  const budgetHours = data.budgetHours !== undefined && data.budgetHours !== null ? Number(data.budgetHours) : null;
  const now = new Date();

  await prisma.$executeRawUnsafe(
    `INSERT INTO clienthub.ch_sub_projects (id, "projectId", "accountId", name, description, stage, "budgetHours", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    id,
    data.projectId,
    data.accountId,
    name,
    description,
    stage,
    budgetHours,
    now,
    now
  );

  return {
    id,
    projectId: data.projectId,
    accountId: data.accountId,
    name,
    description,
    stage,
    budgetHours,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * Updates an existing sub-project.
 */
export async function updateSubProject(
  id: string,
  accountId: string,
  data: {
    name?: string;
    description?: string | null;
    stage?: string;
    budgetHours?: number | null;
  }
): Promise<SubProject | null> {
  await ensureSubProjectsTableExists();

  const existing = (await prisma.$queryRawUnsafe(
    `SELECT * FROM clienthub.ch_sub_projects WHERE id = $1 AND "accountId" = $2`,
    id,
    accountId
  )) as any[];

  if (existing.length === 0) {
    return null;
  }

  const current = existing[0];
  const name = data.name !== undefined ? data.name.trim() : current.name;
  const description = data.description !== undefined ? (data.description?.trim() || null) : current.description;
  const stage = data.stage !== undefined ? data.stage.trim() : current.stage;
  const budgetHours =
    data.budgetHours !== undefined
      ? (data.budgetHours !== null ? Number(data.budgetHours) : null)
      : (current.budgetHours !== null ? Number(current.budgetHours) : null);
  const updatedAt = new Date();

  await prisma.$executeRawUnsafe(
    `UPDATE clienthub.ch_sub_projects
     SET name = $1, description = $2, stage = $3, "budgetHours" = $4, "updatedAt" = $5
     WHERE id = $6 AND "accountId" = $7`,
    name,
    description,
    stage,
    budgetHours,
    updatedAt,
    id,
    accountId
  );

  return {
    id,
    projectId: current.projectId,
    accountId,
    name,
    description,
    stage,
    budgetHours,
    createdAt: current.createdAt instanceof Date ? current.createdAt.toISOString() : String(current.createdAt),
    updatedAt: updatedAt.toISOString(),
  };
}

/**
 * Deletes a sub-project.
 */
export async function deleteSubProject(id: string, accountId: string): Promise<boolean> {
  await ensureSubProjectsTableExists();

  const count = await prisma.$executeRawUnsafe(
    `DELETE FROM clienthub.ch_sub_projects WHERE id = $1 AND "accountId" = $2`,
    id,
    accountId
  );

  return count > 0;
}
