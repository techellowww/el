/**
 * Global shared TypeScript definitions
 */

export type Role = 'ADMIN' | 'EMPLOYEE';

export interface User {
  id: string;
  accountId: string;
  email: string;
  name: string;
  displayName?: string | null;
  title?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  timezone?: string | null;
  bio?: string | null;
  department?: string | null;
  employeeId?: string | null;
  role: Role;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface SessionUser {
  id: string;
  userId?: string;
  accountId: string;
  email: string;
  name: string;
  role: Role;
}

export interface Client {
  id: string;
  accountId: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  portalTokenHash?: string | null;
  portalTokenExpiresAt?: string | Date | null;
  notes?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type ProjectStage = 'PLANNING' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'ON_HOLD';

export interface Project {
  id: string;
  accountId: string;
  clientId: string;
  name: string;
  description?: string | null;
  stage: ProjectStage;
  budgetHours?: number | null;
  hourlyRateCents?: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface SubProject {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  isCompleted: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface TimeEntry {
  id: string;
  accountId: string;
  userId: string;
  projectId?: string | null;
  subProjectId?: string | null;
  description?: string | null;
  startTime: string | Date;
  endTime?: string | Date | null;
  durationSeconds: number;
  isBillable: boolean;
  isApproved: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface Invoice {
  id: string;
  accountId: string;
  clientId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string | Date;
  dueDate: string | Date;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  tokenHash?: string | null;
  tokenExpiresAt?: string | Date | null;
  items?: InvoiceItem[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type ProposalStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED';

export interface Proposal {
  id: string;
  accountId: string;
  clientId: string;
  title: string;
  status: ProposalStatus;
  content: string;
  totalCents?: number | null;
  tokenHash?: string | null;
  tokenExpiresAt?: string | Date | null;
  signedAt?: string | Date | null;
  signerName?: string | null;
  signerEmail?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

