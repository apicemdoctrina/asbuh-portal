/* eslint-env browser */
/* global fetch, Request, Response, URL */
/**
 * Cloudflare Worker — Telegram API proxy
 *
 * Деплой:
 *   1. wrangler deploy  (или через dashboard: вставить код вручную)
 *
 * Переменные окружения Worker'а (Settings → Variables):
 *   SECRET  — произвольная строка, защищает Worker от посторонних запросов
 *
 * На сервере (.env):
 *   TG_PROXY_URL=https://<your-worker>.workers.dev
 *   TG_PROXY_SECRET=<та же строка что в SECRET>
 */

export default {
  async fetch(request, env) {
    // Проверка секрета
    const secret = env.SECRET;
    if (secret && request.headers.get("X-Proxy-Secret") !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Разрешаем только POST (Telegram Bot API использует только POST)
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const tgUrl = "https://api.telegram.org" + url.pathname + url.search;

    const tgRequest = new Request(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: request.body,
    });

    try {
      const tgRes = await fetch(tgRequest);
      return new Response(tgRes.body, {
        status: tgRes.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
