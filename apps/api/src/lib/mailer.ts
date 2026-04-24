import nodemailer from "nodemailer";

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

const FROM = process.env.SMTP_FROM || "noreply@asbuh.local";

let onFailure: ((err: unknown) => void) | null = null;
let onSuccess: (() => void) | null = null;
export function setSmtpHealthReporters(failure: (err: unknown) => void, success: () => void): void {
  onFailure = failure;
  onSuccess = success;
}

/**
 * Send an email without invoking health-alert hooks.
 * Returns true on success. Used internally by health-alerts to avoid recursion.
 * If SMTP is not configured, returns false (caller should fall back).
 */
export async function sendEmailRaw(to: string, subject: string, html: string): Promise<boolean> {
  if (!transporter) return false;
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    return true;
  } catch (err) {
    console.error(`[Mailer] sendEmailRaw failed for ${to}:`, err);
    return false;
  }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    console.log(`[Mailer] Email to ${to}:\n  Subject: ${subject}\n  Body: ${html}`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    onSuccess?.();
  } catch (err) {
    console.error(`[Mailer] sendEmail failed for ${to}:`, err);
    onFailure?.(err);
    throw err;
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!transporter) {
    // Dev fallback: print to console when SMTP is not configured
    console.log(`[Mailer] Password reset link for ${to}:\n  ${resetUrl}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: "Сброс пароля — ASBUH Portal",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#6567F1">Сброс пароля</h2>
          <p>Вы запросили сброс пароля для своей учётной записи.</p>
          <p>
            <a href="${resetUrl}"
               style="display:inline-block;padding:12px 24px;background:#6567F1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
              Сбросить пароль
            </a>
          </p>
          <p style="color:#888;font-size:13px">Ссылка действительна 1 час. Если вы не запрашивали сброс — просто проигнорируйте это письмо.</p>
        </div>
      `,
    });
    onSuccess?.();
  } catch (err) {
    console.error(`[Mailer] sendPasswordResetEmail failed for ${to}:`, err);
    onFailure?.(err);
    throw err;
  }
}
