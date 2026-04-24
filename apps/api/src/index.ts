import app from "./app.js";
import prisma from "./lib/prisma.js";
import { startLongPolling, sendMessage } from "./lib/telegram.js";
import {
  startDailyNotifier,
  startDeadlineReminder,
  startEscalationNotifier,
} from "./lib/task-notifier.js";
import { startTaskArchiver } from "./lib/task-archiver.js";
import { startReportDeadlineNotifier } from "./lib/report-task-generator.js";
import { startBankAutoSync } from "./routes/payments.js";
import { startTemporarySectionRevoker } from "./lib/section-revoker.js";
import { initHealthAlerts } from "./lib/health-alerts.js";

const PORT = process.env.PORT || 3001;

initHealthAlerts();

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

// Handle /start CODE messages from Telegram
startLongPolling(async (msg) => {
  const text = msg.text?.trim() ?? "";
  const match = text.match(/^\/start\s+([A-F0-9]{6})$/i);
  if (!match) return;

  const code = match[1].toUpperCase();
  const binding = await prisma.telegramBinding.findUnique({ where: { code } });

  if (!binding || !binding.codeExpiresAt || binding.codeExpiresAt < new Date()) {
    await sendMessage(
      msg.chat.id,
      "❌ Код недействителен или истёк срок. Сгенерируйте новый код в настройках профиля.",
    );
    return;
  }

  await prisma.telegramBinding.update({
    where: { id: binding.id },
    data: {
      chatId: String(msg.chat.id),
      username: msg.from?.username ?? null,
      code: null,
      codeExpiresAt: null,
      connectedAt: new Date(),
    },
  });

  const firstName = msg.from?.first_name ?? "Привет";
  await sendMessage(
    msg.chat.id,
    `✅ <b>${firstName}, вы подключены к ASBUH Portal!</b>\n\nКаждое утро в 9:00 вы будете получать дайджест актуальных задач.`,
  );
});

startDailyNotifier();
startDeadlineReminder();
startEscalationNotifier();
startTaskArchiver();
startReportDeadlineNotifier();
startBankAutoSync();
startTemporarySectionRevoker();
