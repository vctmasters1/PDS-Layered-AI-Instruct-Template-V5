/**
 * EmailService — Pluggable email delivery.
 *
 * In development / test environments, emails are logged to the console.
 * In production, configure SMTP or a transactional service (SendGrid, SES, etc.)
 * by setting the environment variables below:
 *
 *   EMAIL_PROVIDER   = "resend" | "smtp" | "sendgrid" | "console" (default: "console")
 *   RESEND_API_KEY   = Resend API key (https://resend.com)
 *   SMTP_HOST        = SMTP server hostname
 *   SMTP_PORT        = SMTP port (default: 587)
 *   SMTP_USER        = SMTP username / email
 *   SMTP_PASS        = SMTP password
 *   SENDGRID_API_KEY = SendGrid API key
 *   EMAIL_FROM       = Sender address (default: "noreply@pipedreamsystems.com")
 *   FRONTEND_URL     = Used for building links in emails
 */

const NODE_ENV = process.env.NODE_ENV || "development";
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "console";
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@pipedreamsystems.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Low-level send — dispatches to the configured provider.
 * Returns true on success, false on failure (never throws).
 */
async function sendRaw(payload: EmailPayload): Promise<boolean> {
  try {
    if (EMAIL_PROVIDER === "resend") {
      return await sendViaResend(payload);
    }
    if (EMAIL_PROVIDER === "sendgrid") {
      return await sendViaSendGrid(payload);
    }
    if (EMAIL_PROVIDER === "smtp") {
      return await sendViaSmtp(payload);
    }
    // Default: console
    return sendViaConsole(payload);
  } catch (err: any) {
    console.error("EmailService send error:", err.message);
    return false;
  }
}

// ── Provider Implementations ────────────────────────────────────────────────

function sendViaConsole(payload: EmailPayload): boolean {
  console.log("═══════════════════════════════════════════════════════");
  console.log(`📧 EMAIL (console provider — not actually sent)`);
  console.log(`   To:      ${payload.to}`);
  console.log(`   From:    ${EMAIL_FROM}`);
  console.log(`   Subject: ${payload.subject}`);
  console.log(`   Body:    ${payload.text}`);
  console.log("═══════════════════════════════════════════════════════");
  return true;
}

async function sendViaResend(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set — falling back to console");
    return sendViaConsole(payload);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `PipeDream Systems <${EMAIL_FROM}>`,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
      ...(payload.html ? { html: payload.html } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Resend error:", response.status, body);
    // Fall back to console so verification codes aren't lost
    return sendViaConsole(payload);
  }

  const result = (await response.json()) as any;
  console.log(`📧 Email sent via Resend (id: ${result.id}) to ${payload.to}`);
  return true;
}

async function sendViaSendGrid(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.error("SENDGRID_API_KEY is not set — falling back to console");
    return sendViaConsole(payload);
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: payload.to }] }],
      from: { email: EMAIL_FROM, name: "PipeDream Systems" },
      subject: payload.subject,
      content: [
        { type: "text/plain", value: payload.text },
        ...(payload.html ? [{ type: "text/html", value: payload.html }] : []),
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("SendGrid error:", response.status, body);
    return false;
  }
  return true;
}

async function sendViaSmtp(payload: EmailPayload): Promise<boolean> {
  // Dynamically import nodemailer only when SMTP is configured
  // (avoids hard dependency — install only if needed: npm install nodemailer)
  try {
    // @ts-ignore — nodemailer is an optional dependency
    const nodemailer = await import("nodemailer");

    const transporter = (nodemailer as any).createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"PipeDream Systems" <${EMAIL_FROM}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });

    return true;
  } catch (err: any) {
    console.error("SMTP send error:", err.message);
    // Fall back to console so emails aren't silently lost
    return sendViaConsole(payload);
  }
}

// ── High-Level Convenience Methods ──────────────────────────────────────────

class EmailService {
  /**
   * Send an email verification code.
   */
  async sendVerificationCode(email: string, code: string): Promise<boolean> {
    return sendRaw({
      to: email,
      subject: "PipeDream Systems — Email Verification Code",
      text: `Your verification code is: ${code}\n\nThis code expires in 15 minutes. If you did not request this, please ignore this email.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
          <h2 style="color:#2563eb">PipeDream Systems</h2>
          <p>Your verification code is:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:4px;text-align:center;padding:16px;background:#f3f4f6;border-radius:8px">
            ${code}
          </div>
          <p style="color:#6b7280;font-size:14px;margin-top:16px">
            This code expires in 15 minutes. If you did not request this, please ignore this email.
          </p>
        </div>
      `,
    });
  }

  /**
   * Send a password reset link.
   */
  async sendPasswordReset(email: string, resetToken: string): Promise<boolean> {
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

    return sendRaw({
      to: email,
      subject: "PipeDream Systems — Password Reset",
      text: `You requested a password reset.\n\nReset your password here: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, please ignore this email.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
          <h2 style="color:#2563eb">PipeDream Systems</h2>
          <p>You requested a password reset. Click the link below to set a new password:</p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;margin:16px 0">
            Reset Password
          </a>
          <p style="color:#6b7280;font-size:14px">
            Or copy this link: <br><code>${resetUrl}</code>
          </p>
          <p style="color:#6b7280;font-size:14px;margin-top:16px">
            This link expires in 1 hour. If you did not request this, please ignore this email.
          </p>
        </div>
      `,
    });
  }

  /**
   * Send a generic transactional email.
   */
  async send(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    return sendRaw({ to, subject, text, html });
  }

  /**
   * Send an incomplete listing notification.
   * Tells the user which service listing is missing data and what needs to be fixed.
   */
  async sendIncompleteListingNotice(
    email: string,
    serviceName: string,
    missingFields: string[]
  ): Promise<boolean> {
    const fieldList = missingFields
      .map((f) => `<li style="margin-bottom:4px;">${f}</li>`)
      .join("");
    const fieldListText = missingFields.map((f) => `  • ${f}`).join("\n");
    const settingsUrl = `${FRONTEND_URL}/#account-settings`;

    return sendRaw({
      to: email,
      subject: `PipeDream Systems — Your "${serviceName}" listing needs attention`,
      text: `Hi there,\n\nYour "${serviceName}" listing on PipeDream Marketplace isn't showing correctly because the following information is missing:\n\n${fieldListText}\n\nPlease visit your Account Settings to complete your profile so buyers can find you on the map and in search results.\n\n${settingsUrl}\n\nThank you,\nPipeDream Team`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px">
          <h2 style="color:#2563eb">PipeDream Systems</h2>
          <p>Your <strong>"${serviceName}"</strong> listing on PipeDream Marketplace isn't showing correctly because the following information is missing:</p>
          <ul style="background:#fef3cd;padding:16px 16px 16px 32px;border-radius:8px;border-left:4px solid #f59e0b;">
            ${fieldList}
          </ul>
          <p>Please visit your <strong>Account Settings → Business Identity</strong> to complete your profile so buyers can find you on the map and in search results.</p>
          <a href="${settingsUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;margin:16px 0">
            Complete Your Profile
          </a>
          <p style="color:#6b7280;font-size:14px;margin-top:16px">
            If you believe this is an error, please contact support.
          </p>
        </div>
      `,
    });
  }
}

export const emailService = new EmailService();
export default emailService;
