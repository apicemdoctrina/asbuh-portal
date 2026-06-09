import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment } from "mailparser";
import type { ImapIngestStatus } from "@prisma/client";
import prisma from "./prisma.js";
import { parseStatement } from "./statement-parser.js";
import { ingestStatement } from "./statement-ingest.js";
import { createNotification } from "./notify.js";

const SYSTEM_USER_EMAIL = "system-imap@asbuh.local";
const ONE_C_MARKER = "1CClientBankExchange";
const ONE_C_MARKER_BUF = Buffer.from(ONE_C_MARKER, "utf8");

const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;
let lastConnectFailNotify = 0;

/** Узкий интерфейс — чтобы тесты могли подсунуть мок без живого IMAP. */
export interface ImapClient {
  mailbox(): { uidValidity: bigint };
  searchUnseen(): Promise<number[]>;
  fetchRaw(uid: number): Promise<{
    raw: Buffer;
    envelope: { messageId?: string; subject?: string; from?: string };
  } | null>;
  markSeen(uid: number): Promise<void>;
}

interface Deps {
  client: ImapClient;
  mailbox: string;
  systemUserId: string;
}

export interface ProcessOutcome {
  uid: number;
  status: ImapIngestStatus;
  reason?: string;
  statementId?: string;
  accountNumber?: string;
  envelope?: { messageId?: string; subject?: string; from?: string };
}

/** Один проход по UNSEEN. Возвращает массив outcomes для тестируемости. */
export async function pollOnce(deps: Deps): Promise<ProcessOutcome[]> {
  const { client, mailbox } = deps;
  const uidValidity = client.mailbox().uidValidity;
  const uids = await client.searchUnseen();
  const outcomes: ProcessOutcome[] = [];

  for (const uid of uids) {
    const existing = await prisma.imapStatementLog.findUnique({
      where: { mailbox_uidValidity_uid: { mailbox, uidValidity, uid } },
    });
    if (existing) continue;

    const outcome = await processOne(deps, uid);
    outcomes.push(outcome);

    await prisma.imapStatementLog.create({
      data: {
        mailbox,
        uidValidity,
        uid,
        status: outcome.status,
        reason: outcome.reason ?? null,
        accountNumber: outcome.accountNumber ?? null,
        statementId: outcome.statementId ?? null,
        messageId: outcome.envelope?.messageId ?? null,
        subject: outcome.envelope?.subject ?? null,
        fromAddress: outcome.envelope?.from ?? null,
      },
    });

    try {
      await client.markSeen(uid);
    } catch (e) {
      console.warn(`[imap-watcher] markSeen uid=${uid} failed:`, e);
    }

    if (outcome.status === "UNKNOWN_ACCOUNT" || outcome.status === "PARSE_ERROR") {
      await notifyAdmins(outcome);
    }
  }

  return outcomes;
}

async function processOne(deps: Deps, uid: number): Promise<ProcessOutcome> {
  const { client, systemUserId } = deps;
  let fetched: Awaited<ReturnType<ImapClient["fetchRaw"]>>;
  try {
    fetched = await client.fetchRaw(uid);
  } catch (e: unknown) {
    return { uid, status: "OTHER_ERROR", reason: errMsg(e) };
  }
  if (!fetched) return { uid, status: "OTHER_ERROR", reason: "fetch returned null" };

  const mail = await simpleParser(fetched.raw);
  const attachment = pickOneCAttachment(mail.attachments ?? []);
  if (!attachment) {
    return {
      uid,
      status: "NO_ATTACHMENT",
      reason: "no 1CClientBankExchange attachment",
      envelope: fetched.envelope,
    };
  }

  let parsed;
  try {
    parsed = parseStatement(attachment.content);
  } catch (e: unknown) {
    return { uid, status: "PARSE_ERROR", reason: errMsg(e), envelope: fetched.envelope };
  }

  const accountNumber = parsed.accounts[0]?.accountNumber;
  if (!accountNumber) {
    return {
      uid,
      status: "PARSE_ERROR",
      reason: "parsed but no accountNumber",
      envelope: fetched.envelope,
    };
  }

  const bankAccount = await prisma.organizationBankAccount.findFirst({
    where: { accountNumber },
    select: { organizationId: true },
  });
  if (!bankAccount) {
    return {
      uid,
      status: "UNKNOWN_ACCOUNT",
      reason: `account ${accountNumber} не найден в БД`,
      accountNumber,
      envelope: fetched.envelope,
    };
  }

  try {
    const result = await ingestStatement({
      buffer: attachment.content,
      originalName: attachment.filename ?? `email-${uid}.txt`,
      organizationId: bankAccount.organizationId,
      uploadedById: systemUserId,
      parsedHint: parsed,
    });
    return {
      uid,
      status: "OK",
      statementId: result.statementId,
      accountNumber,
      envelope: fetched.envelope,
    };
  } catch (e: unknown) {
    return {
      uid,
      status: "OTHER_ERROR",
      reason: errMsg(e),
      accountNumber,
      envelope: fetched.envelope,
    };
  }
}

function pickOneCAttachment(attachments: Attachment[]): Attachment | null {
  for (const a of attachments) {
    if (!a.content || a.content.length === 0) continue;
    const head = a.content.subarray(0, 256);
    if (head.indexOf(ONE_C_MARKER_BUF) >= 0) return a;
  }
  return null;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function notifyAdmins(outcome: ProcessOutcome): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { userRoles: { some: { role: { name: "admin" } } } },
    select: { id: true },
  });
  const title =
    outcome.status === "UNKNOWN_ACCOUNT"
      ? "Email-выписка: неизвестный счёт"
      : "Email-выписка: ошибка парсинга";
  const body = [
    outcome.reason,
    outcome.envelope?.subject ? `«${outcome.envelope.subject}»` : null,
    outcome.envelope?.from ? `от ${outcome.envelope.from}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
  for (const a of admins) {
    await createNotification(a.id, "system_alert", title, body);
  }
}

let isPolling = false;

export function startImapStatementWatcher(): void {
  if (process.env.IMAP_DISABLED === "1") {
    console.log("[imap-watcher] disabled via IMAP_DISABLED=1");
    return;
  }
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  if (!host || !user || !pass) {
    console.log("[imap-watcher] disabled: IMAP_HOST/IMAP_USER/IMAP_PASSWORD not set");
    return;
  }
  const port = Number(process.env.IMAP_PORT ?? 993);
  const mailbox = process.env.IMAP_MAILBOX ?? "INBOX";
  const intervalMin = Math.max(1, Number(process.env.IMAP_POLL_INTERVAL_MIN ?? 7));

  const tick = async () => {
    if (isPolling) return;
    isPolling = true;
    let flow: ImapFlow | null = null;
    try {
      flow = new ImapFlow({
        host,
        port,
        secure: true,
        auth: { user, pass },
        logger: false,
      });
      await flow.connect();
      const lock = await flow.getMailboxLock(mailbox);
      try {
        const systemUser = await prisma.user.findUnique({
          where: { email: SYSTEM_USER_EMAIL },
          select: { id: true },
        });
        if (!systemUser) {
          console.error(`[imap-watcher] system user ${SYSTEM_USER_EMAIL} not found; run db:seed`);
          return;
        }
        const client = adaptImapFlow(flow, mailbox);
        const outcomes = await pollOnce({ client, mailbox, systemUserId: systemUser.id });
        if (outcomes.length > 0) {
          console.log(`[imap-watcher] processed ${outcomes.length} message(s)`);
        }
      } finally {
        lock.release();
      }
    } catch (e: unknown) {
      console.error("[imap-watcher] tick error:", e);
      const now = Date.now();
      if (now - lastConnectFailNotify > NOTIFY_COOLDOWN_MS) {
        lastConnectFailNotify = now;
        try {
          const admins = await prisma.user.findMany({
            where: { userRoles: { some: { role: { name: "admin" } } } },
            select: { id: true },
          });
          for (const a of admins) {
            await createNotification(a.id, "system_alert", "IMAP-листенер недоступен", errMsg(e));
          }
        } catch {
          // notify best-effort
        }
      }
    } finally {
      if (flow) {
        try {
          await flow.logout();
        } catch {
          // ignore
        }
      }
      isPolling = false;
    }
  };

  setTimeout(() => {
    void tick();
  }, 10_000);
  setInterval(() => {
    void tick();
  }, intervalMin * 60_000);
  console.log(`[imap-watcher] started: ${user}@${host} every ${intervalMin}min`);
}

function adaptImapFlow(flow: ImapFlow, mailbox: string): ImapClient {
  void mailbox;
  return {
    mailbox() {
      const m = flow.mailbox;
      if (!m || typeof m === "boolean") return { uidValidity: 0n };
      return { uidValidity: BigInt(m.uidValidity ?? 0) };
    },
    async searchUnseen() {
      const uids = await flow.search({ seen: false }, { uid: true });
      return uids ?? [];
    },
    async fetchRaw(uid) {
      const msg = await flow.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
      if (!msg || !msg.source) return null;
      const env = msg.envelope ?? {};
      return {
        raw: msg.source,
        envelope: {
          messageId: env.messageId,
          subject: env.subject,
          from: env.from?.[0]?.address,
        },
      };
    },
    async markSeen(uid) {
      await flow.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    },
  };
}
