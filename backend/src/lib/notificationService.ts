import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { getSmtpSettings, createTransporter } from "./emailService";

export interface QueueNotificationParams {
  accountId: string;
  type: string;
  recipientEmail: string;
  subject: string;
  bodyHtml?: string;
  metadata?: Record<string, any>;
  scheduledFor?: Date;
}

export async function queueNotification(params: QueueNotificationParams) {
  try {
    // Check if account email settings disable this type
    const account = await prisma.account.findUnique({
      where: { id: params.accountId },
      select: { emailSettings: true },
    });

    if (account?.emailSettings) {
      try {
        const settings = JSON.parse(account.emailSettings);
        // Core client transactional emails cannot be disabled per section 8:
        // "Proposal, invoice and signing emails to clients cannot be turned off."
        const nonDisableable = [
          "PROPOSAL_SENT",
          "PROPOSAL_SIGNED",
          "PROPOSAL_DECLINED",
          "INVOICE_SENT",
          "PAYMENT_RECEIVED",
        ];

        if (!nonDisableable.includes(params.type)) {
          const settingKey = getSettingKeyForType(params.type);
          if (settingKey && settings[settingKey] === false) {
            console.log(`[Notification] Skipping ${params.type} as it is disabled by account email preferences.`);
            return null;
          }
        }
      } catch {}
    }

    const notification = await prisma.notification.create({
      data: {
        accountId: params.accountId,
        type: params.type,
        recipientEmail: params.recipientEmail,
        subject: params.subject,
        bodyHtml: params.bodyHtml || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        status: "QUEUED",
        retryCount: 0,
        scheduledFor: params.scheduledFor || new Date(),
      },
    });

    return notification;
  } catch (err: any) {
    console.error("[Notification Service Queue Error]:", err.message);
    throw err;
  }
}

function getSettingKeyForType(type: string): string | null {
  switch (type) {
    case "PROPOSAL_REMINDER":
      return "proposalReminders";
    case "INVOICE_REMINDER":
      return "invoiceReminders";
    case "STATUS_UPDATE":
      return "statusUpdates";
    case "CHAT_MESSAGE":
      return "chatMessages";
    case "MEETING_INVITE":
      return "meetingInvites";
    case "CLIENT_ASSIGNMENT":
      return "clientAssignment";
    case "RETAINER_WARNING":
      return "retainerWarnings";
    default:
      return null;
  }
}

async function getTransporter() {
  const cfg = await getSmtpSettings();
  const transporter = createTransporter(cfg);
  return { transporter, from: cfg.from || "ClientHub Notifications <ellowwwteam@gmail.com>" };
}

export function buildClientHubEmailHtml(options: {
  agencyName: string;
  agencyLogoUrl?: string | null;
  heading: string;
  messageLines: string[];
  buttonText?: string;
  buttonUrl?: string;
  footerNote?: string;
}) {
  const logoHtml = options.agencyLogoUrl
    ? `<img src="${options.agencyLogoUrl}" alt="${options.agencyName}" style="max-height: 48px; max-width: 200px; display: block; margin: 0 auto 16px auto; object-fit: contain;" />`
    : `<h1 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0; letter-spacing: -0.5px;">${options.agencyName}</h1>`;

  const paragraphs = options.messageLines
    .map(
      (line) =>
        `<p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">${line}</p>`
    )
    .join("");

  const buttonHtml =
    options.buttonText && options.buttonUrl
      ? `
      <div style="text-align: center; margin: 32px 0 24px 0;">
        <a href="${options.buttonUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 13px 28px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
          ${options.buttonText} &rarr;
        </a>
      </div>
      `
      : "";

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${options.heading}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
    <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <!-- Header with Agency Branding -->
      <div style="padding: 24px 32px; border-bottom: 1px solid #f1f5f9; text-align: center; background-color: #ffffff;">
        ${logoHtml}
        <div style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">
          ${options.agencyName} Secure Portal
        </div>
      </div>

      <!-- Main Body -->
      <div style="padding: 32px;">
        <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 18px 0; letter-spacing: -0.3px;">
          ${options.heading}
        </h2>

        ${paragraphs}

        ${buttonHtml}

        <div style="padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b; line-height: 1.5;">
          ${options.footerNote || "This is a private, secure communication from your web agency. Please do not share this private link."}
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
}

export async function processNotificationQueue() {
  const { transporter, from } = await getTransporter();

  // Pick up to 20 queued notifications
  const queued = await prisma.notification.findMany({
    where: {
      status: "QUEUED",
      scheduledFor: { lte: new Date() },
    },
    take: 20,
    include: {
      account: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          replyToEmail: true,
        },
      },
    },
  });

  let processedCount = 0;
  let sentCount = 0;
  let failedCount = 0;

  for (const notif of queued) {
    processedCount++;
    try {
      const adminReplyTo = notif.account?.replyToEmail || undefined;

      let html = notif.bodyHtml;
      // If metadata has render instructions, render template
      if (!html && notif.metadata) {
        try {
          const meta = JSON.parse(notif.metadata);
          html = buildClientHubEmailHtml({
            agencyName: notif.account?.name || "ClientHub Agency",
            agencyLogoUrl: notif.account?.logoUrl,
            heading: meta.heading || notif.subject,
            messageLines: meta.lines || [meta.message || notif.subject],
            buttonText: meta.buttonText,
            buttonUrl: meta.buttonUrl,
          });
        } catch {}
      }

      if (!html) {
        html = `<p>${notif.subject}</p>`;
      }

      // Check attachments in metadata
      let attachments: any[] | undefined = undefined;
      if (notif.metadata) {
        try {
          const meta = JSON.parse(notif.metadata);
          if (meta.icsContent) {
            attachments = [
              {
                filename: "invite.ics",
                content: meta.icsContent,
                contentType: "text/calendar; charset=utf-8; method=REQUEST",
              },
            ];
          }
        } catch {}
      }

      await transporter.sendMail({
        from,
        to: notif.recipientEmail,
        replyTo: adminReplyTo,
        subject: notif.subject,
        html,
        attachments,
      });

      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          errorLog: null,
        },
      });

      sentCount++;
    } catch (sendErr: any) {
      console.error(`[Notification Send Error id=${notif.id}]:`, sendErr.message);
      const newRetryCount = notif.retryCount + 1;
      const isFailed = newRetryCount >= 3;

      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          retryCount: newRetryCount,
          status: isFailed ? "FAILED" : "QUEUED",
          errorLog: sendErr.message || "Failed to send email",
          scheduledFor: new Date(Date.now() + newRetryCount * 5 * 60 * 1000),
        },
      });

      if (isFailed) failedCount++;
    }
  }

  return { processedCount, sentCount, failedCount };
}

export async function getFailedNotificationAlerts(accountId: string) {
  return prisma.notification.findMany({
    where: {
      accountId,
      status: "FAILED",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

