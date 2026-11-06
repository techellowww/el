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

let tableInitialized = false;

/**
 * Initializes the ch_sub_projects table and indexes if they do not exist.
 * Uses raw PostgreSQL DDL so it never conflicts with Prisma code generation.
 */
export async function ensureSubProjectsTableExists(): Promise<void> {
  if (tableInitialized) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS clienthub.ch_sub_projects (
        id TEXT PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "accountId" TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        stage TEXT NOT NULL DEFAULT 'IN_PROGRESS',
        "budgetHours" DOUBLE PRECISION,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_sub_projects_project_id
      ON clienthub.ch_sub_projects("projectId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_sub_projects_account_id
      ON clienthub.ch_sub_projects("accountId");
    `);

    tableInitialized = true;
  } catch (error) {
    console.error('[SubProjectService] Failed to ensure table exists:', error);
  }
}

/**
 * Retrieves all sub-projects belonging to a specific project.
 */
export async function getSubProjectsByProject(projectId: string): Promise<SubProject[]> {
  await ensureSubProjectsTableExists();
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT id, "projectId", "accountId", name, description, stage, "budgetHours", "createdAt", "updatedAt"
       FROM clienthub.ch_sub_projects
       WHERE "projectId" = $1
       ORDER BY "createdAt" ASC`,
      projectId
    )) as any[];

    return rows.map((r: any) => ({
      id: r.id,
      projectId: r.projectId,
      accountId: r.accountId,
      name: r.name,
      description: r.description,
      stage: r.stage,
      budgetHours: r.budgetHours !== null ? Number(r.budgetHours) : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    }));
  } catch (err) {
    console.error(`[SubProjectService] Error fetching subprojects for ${projectId}:`, err);
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
  await ensureSubProjectsTableExists();

  try {
    const placeholders = projectIds.map((_, i) => `$${i + 1}`).join(',');
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT id, "projectId", "accountId", name, description, stage, "budgetHours", "createdAt", "updatedAt"
       FROM clienthub.ch_sub_projects
       WHERE "projectId" IN (${placeholders})
       ORDER BY "createdAt" ASC`,
      ...projectIds
    )) as any[];

    const result: Record<string, SubProject[]> = {};
    for (const pid of projectIds) {
      result[pid] = [];
    }

    for (const r of rows) {
      if (result[r.projectId]) {
        result[r.projectId].push({
          id: r.id,
          projectId: r.projectId,
          accountId: r.accountId,
          name: r.name,
          description: r.description,
          stage: r.stage,
          budgetHours: r.budgetHours !== null ? Number(r.budgetHours) : null,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
          updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
        });
      }
    }

    return result;
  } catch (err) {
    console.error('[SubProjectService] Error batch fetching subprojects:', err);
    return {};
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
