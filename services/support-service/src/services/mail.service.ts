import nodemailer from "nodemailer";
import { config } from "../config/env.js";
import { prisma } from "../config/database.js";

let transporter: nodemailer.Transporter | null = null;

if (config.smtp.host && config.smtp.user) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface SendAdminAlertInput {
  ticketNumber: string;
  userEmail: string;
  auditId?: string | null;
  category: string;
  subject: string;
  description: string;
}

export async function sendAdminTicketAlert(input: SendAdminAlertInput) {
  const safeTicket = escapeHtml(input.ticketNumber);
  const safeCategory = escapeHtml(input.category);
  const safeSubject = escapeHtml(input.subject);
  const safeDescription = escapeHtml(input.description);
  const safeUserEmail = escapeHtml(input.userEmail);
  const safeAuditId = input.auditId ? escapeHtml(input.auditId) : null;

  const emailSubject = `[${input.ticketNumber}] ${input.category}: ${input.subject}`;

  const emailBody = `
=============================================================
ALPA Security Auditor - New Support Ticket Notification
=============================================================
Ticket Number : ${input.ticketNumber}
Category      : ${input.category}
Audit ID      : ${input.auditId || "N/A (General Inquiry)"}
User Email    : ${input.userEmail}
Subject       : ${input.subject}

Issue Description:
-------------------------------------------------------------
${input.description}
-------------------------------------------------------------

HOW TO REPLY:
Reply directly to this email from your Gmail, or use the platform interface.
When you reply, the system will record your solution and update the ticket status to RESOLVED.
=============================================================
  `.trim();

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ALPA Support Notification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 30px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 1px solid #1e293b;" cellspacing="0" cellpadding="0">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 28px 32px; border-bottom: 3px solid #6366f1;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                      🛡️ ALPA Security Platform
                    </div>
                    <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">
                      Autonomous Exploit-Simulation Auditor for Lending Protocols
                    </div>
                  </td>
                  <td align="right">
                    <span style="background-color: rgba(99, 102, 241, 0.2); color: #818cf8; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(99, 102, 241, 0.4); display: inline-block;">
                      New Alert
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              
              <!-- Badges Row -->
              <div style="margin-bottom: 20px;">
                <span style="background-color: #e0e7ff; color: #3730a3; font-size: 13px; font-weight: 700; padding: 5px 12px; border-radius: 6px; display: inline-block; margin-right: 8px;">
                  ${safeTicket}
                </span>
                <span style="background-color: #fef3c7; color: #92400e; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 6px; display: inline-block; text-transform: uppercase;">
                  ${safeCategory.replace("_", " ")}
                </span>
              </div>

              <!-- Ticket Subject -->
              <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0; line-height: 1.4;">
                ${safeSubject}
              </h2>

              <!-- Details Table -->
              <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600; width: 35%; border-bottom: 1px solid #e2e8f0;">
                    Related Audit ID:
                  </td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #0f172a; font-weight: 600; border-bottom: 1px solid #e2e8f0;">
                    ${safeAuditId ? `<code style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace;">#${safeAuditId}</code>` : "General Inquiry"}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600; width: 35%;">
                    Submitter Email:
                  </td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #0f172a;">
                    <a href="mailto:${safeUserEmail}" style="color: #4f46e5; text-decoration: none;">${safeUserEmail}</a>
                  </td>
                </tr>
              </table>

              <!-- Description Box -->
              <div style="font-size: 13px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                Issue Description
              </div>
              <div style="background-color: #f1f5f9; border-left: 4px solid #6366f1; border-radius: 0 8px 8px 0; padding: 16px 20px; font-size: 14px; line-height: 1.6; color: #1e293b; margin-bottom: 28px; white-space: pre-wrap;">${safeDescription}</div>

              <!-- Action Callout Box -->
              <div style="background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%); border: 1px solid #a7f3d0; border-radius: 8px; padding: 18px 20px;">
                <table width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="32" valign="top" style="font-size: 20px;">
                      💡
                    </td>
                    <td>
                      <div style="font-size: 14px; font-weight: 700; color: #065f46; margin-bottom: 4px;">
                        Quick Reply Action
                      </div>
                      <div style="font-size: 13px; color: #047857; line-height: 1.5;">
                        You can <strong>reply directly to this email</strong> from your Gmail app. Your response will be automatically saved to this ticket in the platform and the status will be marked as <strong>RESOLVED</strong>.
                      </div>
                    </td>
                  </tr>
                </table>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8;">
              Autonomous Lending Protocol Auditor &bull; EER6689 Final Project &bull; Open University of Sri Lanka
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  if (transporter) {
    try {
      await transporter.sendMail({
        from: config.smtp.from,
        to: config.adminEmail,
        replyTo: config.smtp.from,
        subject: emailSubject,
        text: emailBody,
        html: emailHtml,
      });
      console.log(
        `[MailService] Sent HTML ticket alert to ${config.adminEmail} for ${input.ticketNumber}`,
      );
    } catch (err) {
      console.error("[MailService] Failed to send email via SMTP:", err);
    }
  } else {
    console.log(`\n📧 [DEV EMAIL ALERT -> ${config.adminEmail}]`);
    console.log(`Subject: ${emailSubject}`);
    console.log(emailBody);
    console.log(`[HTML Template: 620px Responsive Card Generated (Sanitized)]`);
    console.log(`📧 [END DEV EMAIL ALERT]\n`);
  }
}

export async function processInboundEmailReply(
  subject: string,
  rawBody: string,
  senderEmail?: string,
) {
  const match = subject.match(/\[?(TICK-[A-Za-z0-9-]+)\]?/i);
  if (!match) {
    throw new Error(
      "Could not find a valid Ticket Number in the email subject.",
    );
  }

  const ticketNumber = match[1].toUpperCase();

  const ticket = await prisma.supportTicket.findUnique({
    where: { ticketNumber },
  });

  if (!ticket) {
    throw new Error(`Ticket ${ticketNumber} not found.`);
  }

  const cleanMessage =
    rawBody.split(/On\s.+wrote:/i)[0].trim() || rawBody.trim();

  const message = await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      senderRole: "AUDITOR",
      senderEmail: senderEmail || config.adminEmail,
      message: cleanMessage,
    },
  });

  const updatedTicket = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "RESOLVED" },
    include: { messages: true },
  });

  return { ticket: updatedTicket, message };
}
