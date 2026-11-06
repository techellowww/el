import { prisma } from "./prisma";
import { queueNotification, processNotificationQueue } from "./notificationService";

export async function runClientHubBackgroundJobs() {
  const results = {
    expiredProposals: 0,
    proposalReminders: 0,
    invoiceReminders: 0,
    retainerWarnings: 0,
    queueResult: null as any,
  };

  const now = new Date();

  // 1. Expire proposals that pass their date (Section 10)
  try {
    const expired = await prisma.proposal.updateMany({
      where: {
        status: "SENT",
        expiresAt: { lte: now },
      },
      data: {
        status: "EXPIRED",
      },
    });
    results.expiredProposals = expired.count;
  } catch (err: any) {
    console.error("[Job: expirePastProposals error]:", err.message);
  }

  // 2. Proposal Reminders (3 days and 7 days after sending, if not signed, Section 8)
  try {
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const pendingProposals = await prisma.proposal.findMany({
      where: {
        status: "SENT",
        sentAt: { lte: threeDaysAgo },
      },
      include: {
        client: true,
        account: true,
      },
    });

    for (const prop of pendingProposals) {
      if (!prop.tokenHash || !prop.client?.email) continue;
      // Check if reminder was already queued recently
      const alreadySent = await prisma.notification.findFirst({
        where: {
          accountId: prop.accountId,
          type: "PROPOSAL_REMINDER",
          recipientEmail: prop.client.email,
          createdAt: { gte: sevenDaysAgo },
        },
      });

      if (!alreadySent) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await queueNotification({
          accountId: prop.accountId,
          type: "PROPOSAL_REMINDER",
          recipientEmail: prop.client.email,
          subject: `Reminder: Proposal awaiting your review - ${prop.title}`,
          metadata: {
            heading: `Reminder: ${prop.title}`,
            lines: [
              `Hello ${prop.client.name},`,
              `This is a friendly reminder that the project proposal "${prop.title}" from ${prop.account.name} is awaiting your signature.`,
              `Please use the secure link below to review and sign or decline at your convenience.`,
            ],
            buttonText: "Review Proposal",
            buttonUrl: `${appUrl}/proposal/${prop.tokenHash}`,
          },
        });
        results.proposalReminders++;
      }
    }
  } catch (err: any) {
    console.error("[Job: proposalReminders error]:", err.message);
  }

  // 3. Invoice Reminders (before due date and after it, if unpaid, Section 8)
  try {
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        status: "SENT",
        dueDate: { not: null },
      },
      include: {
        client: true,
        account: true,
      },
    });

    for (const inv of unpaidInvoices) {
      if (!inv.tokenHash || !inv.client?.email || !inv.dueDate) continue;

      const diffDays = Math.ceil((new Date(inv.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      // Trigger if 3 days before due date or 1 day overdue
      if (diffDays === 3 || diffDays <= -1) {
        const reminderType = diffDays <= -1 ? "OVERDUE" : "UPCOMING";
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const alreadySent = await prisma.notification.findFirst({
          where: {
            accountId: inv.accountId,
            type: "INVOICE_REMINDER",
            recipientEmail: inv.client.email,
            createdAt: { gte: oneDayAgo },
          },
        });

        if (!alreadySent) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          await queueNotification({
            accountId: inv.accountId,
            type: "INVOICE_REMINDER",
            recipientEmail: inv.client.email,
            subject: `Reminder: Invoice ${inv.invoiceNumberDisplay || ""} is ${reminderType === "OVERDUE" ? "overdue" : "due soon"}`,
            metadata: {
              heading: `Invoice Reminder: ${inv.invoiceNumberDisplay || ""}`,
              lines: [
                `Hello ${inv.client.name},`,
                `This is a notice regarding Invoice ${inv.invoiceNumberDisplay || ""} from ${inv.account.name}.`,
                reminderType === "OVERDUE"
                  ? `This invoice was due on ${new Date(inv.dueDate).toLocaleDateString()} and is currently marked as overdue.`
                  : `This invoice is scheduled for payment by ${new Date(inv.dueDate).toLocaleDateString()}.`,
                `Please review your invoice line items and payment instructions via the secure link below.`,
              ],
              buttonText: "View Invoice",
              buttonUrl: `${appUrl}/invoice/${inv.tokenHash}`,
            },
          });
          results.invoiceReminders++;
        }
      }
    }
  } catch (err: any) {
    console.error("[Job: invoiceReminders error]:", err.message);
  }

  // 4. Retainer Warnings: Hours used reach 80% and 100% (Section 8 & 10)
  try {
    const activeProjects = await prisma.project.findMany({
      where: {
        budgetHours: { not: null, gt: 0 },
      },
      include: {
        account: true,
        client: true,
        timeEntries: {
          select: { durationSeconds: true },
        },
      },
    });

    for (const project of activeProjects) {
      if (!project.budgetHours) continue;
      const totalSeconds = project.timeEntries.reduce((sum, te) => sum + (te.durationSeconds || 0), 0);
      const totalHours = totalSeconds / 3600;
      const percentUsed = (totalHours / project.budgetHours) * 100;

      if (percentUsed >= 80) {
        const threshold = percentUsed >= 100 ? 100 : 80;
        // Check if admin was already warned for this project & threshold this week
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const adminUser = await prisma.user.findFirst({
          where: { accountId: project.accountId, role: "ADMIN" },
          select: { email: true },
        });

        if (adminUser?.email) {
          const alreadyWarned = await prisma.notification.findFirst({
            where: {
              accountId: project.accountId,
              type: "RETAINER_WARNING",
              recipientEmail: adminUser.email,
              createdAt: { gte: sevenDaysAgo },
              metadata: { contains: `"threshold":${threshold}` },
            },
          });

          if (!alreadyWarned) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            await queueNotification({
              accountId: project.accountId,
              type: "RETAINER_WARNING",
              recipientEmail: adminUser.email,
              subject: `Retainer Warning: ${project.name} has reached ${threshold}% of allocated budget`,
              metadata: {
                heading: `Retainer Warning (${threshold}%)`,
                lines: [
                  `Project: "${project.name}" for client "${project.client.name}".`,
                  `Budget used: ${totalHours.toFixed(1)} / ${project.budgetHours} hours (${percentUsed.toFixed(0)}%).`,
                  `Please review project hours and adjust scope or allocate additional retainer budget as required.`,
                ],
                buttonText: "Review Project Time",
                buttonUrl: `${appUrl}/projects`,
                threshold,
              },
            });
            results.retainerWarnings++;
          }
        }
      }
    }
  } catch (err: any) {
    console.error("[Job: retainerWarnings error]:", err.message);
  }

  // 5. Retry queued notifications with exponential backoff (Section 8 & 10)
  try {
    const queueRes = await processNotificationQueue();
    results.queueResult = queueRes;
  } catch (err: any) {
    console.error("[Job: processNotificationQueue error]:", err.message);
  }

  return results;
}
