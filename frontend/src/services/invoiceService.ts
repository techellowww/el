import { prisma } from "@/lib/db";
import { generateSecureToken, hashToken } from "@/lib/auth";
import { queueNotification } from "./notificationService";

export interface InvoiceItemInput {
  description: string;
  quantity?: number;
  unitPriceCents: number;
  timeEntryId?: string;
}

export interface CreateInvoiceParams {
  accountId: string;
  clientId: string;
  projectId?: string;
  dueDate?: string | Date;
  notes?: string;
  items: InvoiceItemInput[];
}

/**
 * Creates a DRAFT invoice. Does not assign an invoice number yet.
 * Per Section 6: "Invoice numbers are given when the invoice is sent, in order, with no gaps."
 */
export async function createDraftInvoice(params: CreateInvoiceParams) {
  if (!params.items || params.items.length === 0) {
    throw new Error("An invoice must contain at least one line item.");
  }

  // Calculate totals in integer cents
  let subtotalCents = 0;
  const preparedItems = params.items.map((item) => {
    const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
    const totalCents = Math.round(qty * item.unitPriceCents);
    subtotalCents += totalCents;
    return {
      accountId: params.accountId,
      description: item.description.trim(),
      quantity: qty,
      unitPriceCents: item.unitPriceCents,
      totalCents,
      timeEntryId: item.timeEntryId || null,
    };
  });

  const totalCents = subtotalCents; // Tax can be 0 or calculated

  const invoice = await prisma.invoice.create({
    data: {
      accountId: params.accountId,
      clientId: params.clientId,
      projectId: params.projectId || null,
      status: "DRAFT",
      currency: "USD",
      subtotalCents,
      taxCents: 0,
      totalCents,
      dueDate: params.dueDate ? new Date(params.dueDate) : null,
      notes: params.notes?.trim() || null,
      items: {
        create: preparedItems,
      },
    },
    include: {
      client: true,
      project: true,
      items: true,
    },
  });

  return invoice;
}

/**
 * Sends an invoice to the client:
 * - Assigns sequential gapless invoice number for the account
 * - Generates random private token & stores only SHA-256 hash
 * - Locks associated time entries
 * - Snapshots current agency logo
 * - Queues INVOICE_SENT email notification
 * - Writes to audit log
 */
export async function sendInvoice(invoiceId: string, accountId: string, userId?: string) {
  return prisma.$transaction(async (tx: any) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, accountId },
      include: {
        client: true,
        items: true,
        account: true,
      },
    });

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    if (invoice.status === "PAID" || invoice.status === "VOID") {
      throw new Error(`Cannot send an invoice with status ${invoice.status}`);
    }

    // Determine sequential gapless invoice number if not already assigned
    let invoiceNumber = invoice.invoiceNumber;
    if (!invoiceNumber) {
      const highest = await tx.invoice.findFirst({
        where: { accountId, invoiceNumber: { not: null } },
        orderBy: { invoiceNumber: "desc" },
        select: { invoiceNumber: true },
      });
      invoiceNumber = (highest?.invoiceNumber || 1000) + 1;
    }

    const invoiceNumberDisplay = `INV-${String(invoiceNumber).padStart(4, "0")}`;

    // Generate random 64-character token and store hash
    const rawToken = "ch_inv_" + generateSecureToken(32);
    const tokenHash = hashToken(rawToken);

    // Snapshot agency logo
    const logoSnapshotUrl = invoice.account.logoUrl || null;

    // Lock associated time entries
    const linkedTimeEntryIds = invoice.items
      .map((i: any) => i.timeEntryId)
      .filter(Boolean) as string[];

    if (linkedTimeEntryIds.length > 0) {
      await tx.timeEntry.updateMany({
        where: { id: { in: linkedTimeEntryIds }, accountId },
        data: {
          isLocked: true,
          invoiceId: invoice.id,
        },
      });
    }

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        invoiceNumber,
        invoiceNumberDisplay,
        status: "SENT",
        sentAt: new Date(),
        tokenHash,
        logoSnapshotUrl,
      },
      include: {
        client: true,
        project: true,
        items: true,
      },
    });

    // Write audit log
    await tx.auditLog.create({
      data: {
        accountId,
        userId: userId || null,
        action: "SEND",
        entityType: "INVOICE",
        entityId: invoice.id,
        details: JSON.stringify({
          invoiceNumber: invoiceNumberDisplay,
          client: invoice.client.name,
          totalCents: invoice.totalCents,
        }),
      },
    });

    // Queue email to client with button carrying link only (no prices/details in body per Section 8)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const invoiceLink = `${appUrl}/invoice/${rawToken}`;

    await queueNotification({
      accountId,
      type: "INVOICE_SENT",
      recipientEmail: invoice.client.email,
      subject: `New Invoice from ${invoice.account.name}: ${invoiceNumberDisplay}`,
      metadata: {
        heading: `New Invoice: ${invoiceNumberDisplay}`,
        message: `${invoice.account.name} has prepared an invoice for your recent deliverables. Please view your invoice via the secure link below.`,
        lines: [
          `Hello ${invoice.client.name},`,
          `A new invoice (${invoiceNumberDisplay}) has been issued for your account by ${invoice.account.name}.`,
          `Please use the secure button below to inspect your invoice line items and view payment instructions.`,
        ],
        buttonText: "View Your Invoice",
        buttonUrl: invoiceLink,
      },
    });

    return {
      invoice: updated,
      rawToken,
      invoiceUrl: `/invoice/${rawToken}`,
    };
  });
}

/**
 * Marks an invoice as PAID:
 * - Records Payment in payments table
 * - Queues PAYMENT_RECEIVED email to client and admin
 * - Writes to audit log
 */
export async function markInvoiceAsPaid(
  invoiceId: string,
  accountId: string,
  userId?: string,
  options?: { paymentMethod?: string; notes?: string }
) {
  return prisma.$transaction(async (tx: any) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, accountId },
      include: {
        client: true,
        account: true,
      },
    });

    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "PAID") throw new Error("Invoice is already marked as paid");
    if (invoice.status === "VOID") throw new Error("Cannot pay a voided invoice");

    const payment = await tx.payment.create({
      data: {
        accountId,
        invoiceId: invoice.id,
        amountCents: invoice.totalCents,
        currency: invoice.currency,
        paymentMethod: options?.paymentMethod || "MANUAL",
        notes: options?.notes || "Marked as paid by agency owner",
        paidAt: new Date(),
      },
    });

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
      include: {
        client: true,
        project: true,
        items: true,
        payments: true,
      },
    });

    // Write audit log
    await tx.auditLog.create({
      data: {
        accountId,
        userId: userId || null,
        action: "PAYMENT",
        entityType: "INVOICE",
        entityId: invoice.id,
        details: JSON.stringify({
          amountCents: invoice.totalCents,
          method: options?.paymentMethod || "MANUAL",
          invoiceNumber: invoice.invoiceNumberDisplay,
        }),
      },
    });

    // Queue Payment Received emails to both Client and Admin
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const portalUrl = invoice.client.portalTokenHash
      ? `${appUrl}/portal/${invoice.client.portalTokenHash}`
      : `${appUrl}/clients`;

    // To Client
    await queueNotification({
      accountId,
      type: "PAYMENT_RECEIVED",
      recipientEmail: invoice.client.email,
      subject: `Payment Confirmed: ${invoice.invoiceNumberDisplay || "Invoice"}`,
      metadata: {
        heading: "Payment Receipt Confirmed",
        lines: [
          `Hello ${invoice.client.name},`,
          `We have successfully recorded your payment for invoice ${invoice.invoiceNumberDisplay || ""}. Thank you for your business!`,
          `You can view your current projects and deliverables in your client portal.`,
        ],
        buttonText: "Open Client Hub",
        buttonUrl: portalUrl,
      },
    });

    // To Admin
    const adminUser = await tx.user.findFirst({
      where: { accountId, role: "ADMIN" },
      select: { email: true },
    });
    if (adminUser?.email) {
      await queueNotification({
        accountId,
        type: "PAYMENT_RECEIVED",
        recipientEmail: adminUser.email,
        subject: `Payment Recorded: ${invoice.invoiceNumberDisplay} (${invoice.client.name})`,
        metadata: {
          heading: "Invoice Paid",
          lines: [
            `Payment was recorded for invoice ${invoice.invoiceNumberDisplay} from ${invoice.client.name}.`,
            `Status updated to PAID in system records.`,
          ],
          buttonText: "View Invoices",
          buttonUrl: `${appUrl}/invoices`,
        },
      });
    }

    return { invoice: updated, payment };
  });
}

/**
 * Voids an invoice:
 * - Sets status = VOID
 * - Unlocks associated time entries so they can be re-billed (Section 6)
 * - Writes to audit log
 */
export async function voidInvoice(
  invoiceId: string,
  accountId: string,
  userId?: string,
  reason?: string
) {
  return prisma.$transaction(async (tx: any) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, accountId },
      include: { items: true },
    });

    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "PAID") throw new Error("Cannot void an invoice that is already paid");

    // Unlock any locked time entries
    const linkedTimeEntryIds = invoice.items
      .map((i: any) => i.timeEntryId)
      .filter(Boolean) as string[];

    if (linkedTimeEntryIds.length > 0) {
      await tx.timeEntry.updateMany({
        where: { id: { in: linkedTimeEntryIds }, accountId },
        data: {
          isLocked: false,
          invoiceId: null,
        },
      });
    }

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        notes: reason ? `${invoice.notes || ""}\n[Voided]: ${reason}`.trim() : invoice.notes,
      },
      include: {
        client: true,
        project: true,
        items: true,
      },
    });

    // Write audit log
    await tx.auditLog.create({
      data: {
        accountId,
        userId: userId || null,
        action: "VOID",
        entityType: "INVOICE",
        entityId: invoice.id,
        details: JSON.stringify({
          invoiceNumber: invoice.invoiceNumberDisplay,
          reason: reason || "Voided by admin",
        }),
      },
    });

    return updated;
  });
}

/**
 * Public client access via long random token hash
 */
export async function getInvoiceByToken(rawToken: string) {
  if (!rawToken || typeof rawToken !== "string") {
    throw new Error("Invalid invoice token");
  }

  const tokenHash = hashToken(rawToken);

  const invoice = await prisma.invoice.findFirst({
    where: { tokenHash },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          currency: true,
          logoUrl: true,
          replyToEmail: true,
        },
      },
      client: {
        select: {
          id: true,
          name: true,
          company: true,
          email: true,
          phone: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      items: true,
      payments: true,
    },
  });

  if (!invoice) {
    throw new Error("Invoice not found or link has expired");
  }

  return invoice;
}

/**
 * Deletes an invoice:
 * - Admin only
 * - Unlocks associated time entries (setting isLocked: false, invoiceId: null) so billable hours are safely restored (Section 5 & 6)
 * - Deletes invoice line items and payments
 * - Writes to audit log
 */
export async function deleteInvoice(
  invoiceId: string,
  accountId: string,
  userId?: string
) {
  return prisma.$transaction(async (tx: any) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, accountId },
      include: {
        items: true,
        client: true,
      },
    });

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    // Unlock associated time entries so billable hours return to unbilled state
    const linkedTimeEntryIds = invoice.items
      .map((i: any) => i.timeEntryId)
      .filter(Boolean) as string[];

    await tx.timeEntry.updateMany({
      where: {
        accountId,
        OR: [
          { invoiceId: invoice.id },
          ...(linkedTimeEntryIds.length > 0 ? [{ id: { in: linkedTimeEntryIds } }] : []),
        ],
      },
      data: {
        isLocked: false,
        invoiceId: null,
      },
    });

    // Delete items
    await tx.invoiceItem.deleteMany({
      where: { invoiceId: invoice.id },
    });

    // Delete payments
    await tx.payment.deleteMany({
      where: { invoiceId: invoice.id },
    });

    // Write audit log
    await tx.auditLog.create({
      data: {
        accountId,
        userId: userId || null,
        action: "DELETE",
        entityType: "INVOICE",
        entityId: invoice.id,
        details: JSON.stringify({
          invoiceNumber: invoice.invoiceNumberDisplay || "DRAFT",
          totalCents: invoice.totalCents,
          status: invoice.status,
          client: invoice.client?.name,
        }),
      },
    });

    // Delete invoice
    await tx.invoice.delete({
      where: { id: invoice.id },
    });

    return {
      success: true,
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumberDisplay || "DRAFT",
    };
  });
}

/**
 * Bulk deletes invoices:
 * - Admin only
 * - Unlocks associated time entries for all deleted invoices
 * - Deletes line items, payments, and invoices
 * - Writes audit logs
 */
export async function deleteInvoices(
  invoiceIds: string[],
  accountId: string,
  userId?: string
) {
  return prisma.$transaction(async (tx: any) => {
    const invoices = await tx.invoice.findMany({
      where: { id: { in: invoiceIds }, accountId },
      include: { items: true, client: true },
    });

    if (invoices.length === 0) {
      return { success: true, count: 0 };
    }

    const foundIds = invoices.map((inv: any) => inv.id);

    // Collect time entry IDs to unlock
    const allTimeEntryIds: string[] = [];
    for (const inv of invoices) {
      for (const item of inv.items) {
        if (item.timeEntryId) {
          allTimeEntryIds.push(item.timeEntryId);
        }
      }
    }

    await tx.timeEntry.updateMany({
      where: {
        accountId,
        OR: [
          { invoiceId: { in: foundIds } },
          ...(allTimeEntryIds.length > 0 ? [{ id: { in: allTimeEntryIds } }] : []),
        ],
      },
      data: {
        isLocked: false,
        invoiceId: null,
      },
    });

    // Delete line items
    await tx.invoiceItem.deleteMany({
      where: { invoiceId: { in: foundIds } },
    });

    // Delete payments
    await tx.payment.deleteMany({
      where: { invoiceId: { in: foundIds } },
    });

    // Create audit log entries
    for (const inv of invoices) {
      await tx.auditLog.create({
        data: {
          accountId,
          userId: userId || null,
          action: "DELETE",
          entityType: "INVOICE",
          entityId: inv.id,
          details: JSON.stringify({
            invoiceNumber: inv.invoiceNumberDisplay || "DRAFT",
            totalCents: inv.totalCents,
            status: inv.status,
            client: inv.client?.name,
            bulk: true,
          }),
        },
      });
    }

    // Delete invoices
    await tx.invoice.deleteMany({
      where: { id: { in: foundIds } },
    });

    return { success: true, count: foundIds.length };
  });
}



