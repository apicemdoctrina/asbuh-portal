/**
 * Thin Telegram Bot API wrapper.
 * Uses built-in fetch (Node 18+). No external dependencies.
 *
 * Proxy support:
 *   TG_PROXY_URL    — Cloudflare Worker URL (e.g. https://tg.example.workers.dev)
 *   TG_PROXY_SECRET — shared secret sent in X-Proxy-Secret header
 *
 * Legacy HTTPS_PROXY (undici) is still supported as fallback.
 */

import { ProxyAgent, setGlobalDispatcher } from "undici";

if (process.env.HTTPS_PROXY && !process.env.TG_PROXY_URL) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
  console.log(`[Telegram] Using HTTPS proxy: ${process.env.HTTPS_PROXY}`);
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_PROXY_URL = process.env.TG_PROXY_URL?.replace(/\/$/, "");
const TG_PROXY_SECRET = process.env.TG_PROXY_SECRET;

const API_BASE = BOT_TOKEN
  ? TG_PROXY_URL
    ? `${TG_PROXY_URL}/bot${BOT_TOKEN}`
    : `https://api.telegram.org/bot${BOT_TOKEN}`
  : "";

if (BOT_TOKEN && TG_PROXY_URL) {
  console.log(`[Telegram] Using Cloudflare Worker proxy: ${TG_PROXY_URL}`);
}

export type TgMessage = {
  message_id: number;
  chat: { id: number };
  from?: { id: number; username?: string; first_name?: string };
  text?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tgFetch(method: string, body?: object): Promise<any> {
  if (!BOT_TOKEN) return null;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (TG_PROXY_URL && TG_PROXY_SECRET) {
      headers["X-Proxy-Secret"] = TG_PROXY_SECRET;
    }
    const res = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok || data?.ok === false) {
      console.error(
        `[Telegram] ${method} failed: status=${res.status} response=${JSON.stringify(data)}`,
      );
    }
    return data;
  } catch (err) {
    console.error(`[Telegram] ${method} error:`, err);
    return null;
  }
}

export async function sendMessage(chatId: string | number, text: string): Promise<void> {
  await tgFetch("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

let cachedBotName: string | null = null;
export async function getBotName(): Promise<string> {
  if (cachedBotName) return cachedBotName;
  if (!BOT_TOKEN) return "bot";
  const res = await tgFetch("getMe");
  cachedBotName = res?.result?.username || "bot";
  return cachedBotName!;
}

let pollingOffset = 0;
let pollingActive = false;

export function startLongPolling(onMessage: (msg: TgMessage) => void): void {
  if (!BOT_TOKEN) {
    console.log("[Telegram] TELEGRAM_BOT_TOKEN not set — notifications disabled");
    return;
  }
  pollingActive = true;
  console.log("[Telegram] Starting long polling...");
  setImmediate(() => pollLoop(onMessage));
}

async function pollLoop(onMessage: (msg: TgMessage) => void): Promise<void> {
  while (pollingActive) {
    const data = await tgFetch("getUpdates", {
      offset: pollingOffset,
      timeout: 25,
      limit: 100,
      allowed_updates: ["message"],
    });

    if (data?.result?.length) {
      for (const update of data.result) {
        pollingOffset = update.update_id + 1;
        if (update.message) {
          try {
            await onMessage(update.message as TgMessage);
          } catch (err) {
            console.error("[Telegram] onMessage handler error:", err);
          }
        }
      }
    }

    if (!data) {
      // Network error — back off
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
