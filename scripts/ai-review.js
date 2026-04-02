#!/usr/bin/env node
/**
 * AI Plan Review — отправляет план изменений в Gemini и возвращает ревью.
 *
 * Использование:
 *   echo "текст плана" | node scripts/ai-review.js
 *   node scripts/ai-review.js < plan.md
 *   node scripts/ai-review.js "текст плана в аргументе"
 *
 * Требует: GEMINI_API_KEY в apps/api/.env или переменной окружения.
 * Получить ключ: https://aistudio.google.com/apikey (бесплатно)
 */

import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load GEMINI_API_KEY ───────────────────────────────────────────────────────

function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  const envPath = resolve(__dirname, "../apps/api/.env");
  if (existsSync(envPath)) {
    const raw = readFileSync(envPath, "utf8");
    const match = raw.match(/^GEMINI_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }

  return null;
}

// ── Read input ────────────────────────────────────────────────────────────────

async function readInput() {
  if (process.argv[2]) return process.argv.slice(2).join(" ");

  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    const lines = [];
    for await (const line of rl) lines.push(line);
    return lines.join("\n");
  }

  console.error("Использование: echo 'план' | node scripts/ai-review.js");
  process.exit(1);
}

// ── Gemini API ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — senior fullstack разработчик, ревьюер планов изменений.

Стек проекта: Express 5 + TypeScript, Prisma ORM, PostgreSQL, React 18 + Tailwind CSS v4, React Router v7.

Твоя задача — проверить план изменений и дать короткое, конкретное заключение.

Проверяй:
1. Пропущенные edge cases (null/undefined, пустые массивы, права доступа)
2. Проблемы безопасности (SQL injection, XSS, отсутствие валидации, missing auth)
3. Ошибки в архитектуре API (неверные HTTP-методы, конфликты роутов, неправильный порядок middleware)
4. Проблемы миграций БД (необратимые изменения, отсутствие индексов, каскадные удаления)
5. Frontend-проблемы (неправильный вызов api(), отсутствие loading/error состояний, утечки памяти в useEffect)
6. Логические противоречия в плане

Формат ответа — строго:
## Вердикт
[УТВЕРЖДЁН / УТВЕРЖДЁН С ЗАМЕЧАНИЯМИ / ОТКЛОНЁН]

## Найденные проблемы
(если есть — пронумерованный список, каждый пункт: проблема + конкретное исправление)
(если нет — "Проблем не найдено")

## Улучшения (опционально)
(только если есть реально важные улучшения, не более 3)

Отвечай кратко и по делу. Не повторяй план обратно.`;

async function callModel(apiKey, model, plan) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: plan }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err?.error?.message ?? res.statusText), { status: res.status });
  }

  const data = await res.json();
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(пустой ответ)", model };
}

async function review(apiKey, plan) {
  const models = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-flash-lite-latest"];

  for (const model of models) {
    try {
      return await callModel(apiKey, model, plan);
    } catch (err) {
      if (err.status === 429 || err.status === 404 || err.status === 403) {
        process.stdout.write(`   ⚠️  ${model} (${err.status}): ${err.message}\n`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    "Все модели вернули ошибку. Проверь GEMINI_API_KEY на https://aistudio.google.com/apikey",
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const apiKey = loadApiKey();
if (!apiKey) {
  console.error(
    "❌  GEMINI_API_KEY не найден.\n" +
      "    Добавь в apps/api/.env:\n" +
      "    GEMINI_API_KEY=ваш_ключ\n\n" +
      "    Получить ключ (бесплатно): https://aistudio.google.com/apikey",
  );
  process.exit(1);
}

const plan = await readInput();
if (plan.trim().length < 20) {
  console.error("❌  Слишком короткий план (минимум 20 символов).");
  process.exit(1);
}

console.log("\n🔍  Отправляю план на ревью...\n");

try {
  const { text, model } = await review(apiKey, plan);
  console.log(`   (модель: ${model})\n`);
  console.log("─".repeat(60));
  console.log(text);
  console.log("─".repeat(60) + "\n");
} catch (err) {
  console.error("❌  Ошибка:", err.message);
  process.exit(1);
}
