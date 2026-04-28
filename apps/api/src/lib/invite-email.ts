import { sendEmail } from "./mailer.js";

const APP_URL = process.env.APP_URL || "https://app.asbuh.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendInviteEmail(args: {
  to: string;
  organizationName: string;
  inviteToken: string;
  expiresAt: Date;
  invitedByName?: string | null;
}): Promise<void> {
  const inviteUrl = `${APP_URL}/invite/${args.inviteToken}`;
  const expiresLabel = args.expiresAt.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const inviterLine = args.invitedByName
    ? `<p style="margin:0 0 8px 0;color:#475569">Приглашение от: <strong>${escapeHtml(args.invitedByName)}</strong></p>`
    : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1e293b;line-height:1.5">
      <div style="background:linear-gradient(135deg,#6567F1,#5557E1);padding:24px;border-radius:12px 12px 0 0;color:#fff">
        <h2 style="margin:0;font-size:22px">ASBUH</h2>
        <p style="margin:6px 0 0 0;color:rgba(255,255,255,0.85);font-size:14px">Бухгалтерия с прозрачным сервисом</p>
      </div>
      <div style="padding:28px;background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
        <h3 style="margin:0 0 16px 0;color:#1e293b;font-size:18px">Здравствуйте!</h3>
        <p style="margin:0 0 12px 0;color:#475569">
          Для вашей компании <strong>${escapeHtml(args.organizationName)}</strong>
          мы открыли личный кабинет в портале ASBUH.
        </p>
        ${inviterLine}
        <p style="margin:16px 0 8px 0;color:#475569">В кабинете вы увидите:</p>
        <ul style="margin:0 0 20px 0;padding-left:20px;color:#475569">
          <li>статус учёта по вашей компании в реальном времени;</li>
          <li>запросы документов от вашего бухгалтера в одном списке;</li>
          <li>задолженность и историю платежей;</li>
          <li>прямой канал связи с бухгалтером через тикеты.</li>
        </ul>
        <p style="margin:24px 0">
          <a href="${inviteUrl}"
             style="display:inline-block;padding:14px 28px;background:#6567F1;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">
            Открыть кабинет
          </a>
        </p>
        <p style="margin:16px 0 0 0;color:#94a3b8;font-size:13px">
          Ссылка действительна до <strong>${escapeHtml(expiresLabel)}</strong>.
          При первом входе вас попросят придумать пароль и принять условия обслуживания.
        </p>
        <p style="margin:12px 0 0 0;color:#94a3b8;font-size:13px">
          Если вы получили это письмо по ошибке — просто проигнорируйте его, ничего не произойдёт.
        </p>
      </div>
      <p style="margin-top:16px;color:#94a3b8;font-size:12px;text-align:center">
        ASBUH · ваш аутсорсинг-бухгалтер
      </p>
    </div>
  `;

  await sendEmail(args.to, `Приглашение в личный кабинет ASBUH — ${args.organizationName}`, html);
}
