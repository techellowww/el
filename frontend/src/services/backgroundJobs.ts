import { prisma } from "@/lib/db";
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
      // Send reminder if 2 days before due date or overdue by 1+ days
      const shouldRemind = diffDays <= 2;

      if (shouldRemind) {
        const recentReminder = await prisma.notification.findFirst({
          where: {
            accountId: inv.accountId,
            type: "INVOICE_REMINDER",
            recipientEmail: inv.client.email,
            createdAt: { gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
          },
        });

        if (!recentReminder) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const isOverdue = diffDays < 0;
          await queueNotification({
            accountId: inv.accountId,
            type: "INVOICE_REMINDER",
            recipientEmail: inv.client.email,
            subject: `${isOverdue ? "Overdue" : "Upcoming"} Invoice Reminder: ${inv.invoiceNumberDisplay || "Invoice"}`,
            metadata: {
              heading: isOverdue ? "Invoice Payment Overdue" : "Invoice Due Soon",
              lines: [
                `Hello ${inv.client.name},`,
                `This is a reminder regarding invoice ${inv.invoiceNumberDisplay || ""} from ${inv.account.name}.`,
                isOverdue
                  ? `This invoice was due on ${new Date(inv.dueDate).toLocaleDateString()}. Please process payment at your earliest convenience.`
                  : `This invoice is due on ${new Date(inv.dueDate).toLocaleDateString()}.`,
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

  // 4. Retainer Warning: Warn owner when project hours reach 80% and 100% (Section 8 & 10)
  try {
    const activeProjects = await prisma.project.findMany({
      where: {
        budgetHours: { gt: 0 },
      },
      include: {
        client: true,
        account: true,
        timeEntries: { select: { durationSeconds: true } },
      },
    });

    for (const proj of activeProjects) {
      if (!proj.budgetHours) continue;
      const totalHours =
        proj.timeEntries.reduce((sum: number, e: any) => sum + (e.durationSeconds || 0), 0) / 3600;

      const pct = (totalHours / proj.budgetHours) * 100;
      if (pct >= 80) {
        const threshold = pct >= 100 ? "100%" : "80%";
        const alreadyWarned = await prisma.notification.findFirst({
          where: {
            accountId: proj.accountId,
            type: `RETAINER_WARNING_${threshold}_${proj.id}`,
            createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
          },
        });

        if (!alreadyWarned) {
          const adminUser = await prisma.user.findFirst({
            where: { accountId: proj.accountId, role: "ADMIN" },
            select: { email: true },
          });

          if (adminUser?.email) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            await queueNotification({
              accountId: proj.accountId,
              type: `RETAINER_WARNING_${threshold}_${proj.id}`,
              recipientEmail: adminUser.email,
              subject: `Retainer Warning: ${proj.name} reached ${threshold} of budget`,
              metadata: {
                heading: `Retainer Alert: ${proj.name} (${threshold})`,
                lines: [
                  `Attention Agency Owner: Project "${proj.name}" for client "${proj.client.name}" has utilized ${totalHours.toFixed(1)} of ${proj.budgetHours} allocated budget hours (${Math.round(pct)}%).`,
                  pct >= 100
                    ? "The allocated retainer budget has been fully consumed. Further hours will exceed the agreed scope."
                    : "The retainer is approaching capacity. Consider reviewing deliverables with the client.",
                ],
                buttonText: "Review Project Hours",
                buttonUrl: `${appUrl}/projects`,
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

  // 5. Process queued notifications and retry failed emails
  try {
    results.queueResult = await processNotificationQueue();
  } catch (err: any) {
    console.error("[Job: processNotificationQueue error]:", err.message);
  }

  return results;
}

