import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";

const JWT_SECRET = process.env.JWT_SECRET ?? "";
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required — set it in apps/api/.env (see .env.example)");
}
const TTL_MS = 5 * 60 * 1000;

export interface OAuthState {
  bankAccountId: string;
  userId: string;
}

/**
 * Кодек OAuth-state (CSRF + привязка к счёту). Два транспорта, один контракт:
 *
 * - **JWT** (`createJwtStateCodec`) — самодостаточный токен, переживает рестарт api,
 *   но длинный (~200 символов). Используется Сбером и Альфой.
 * - **Nonce** (`createNonceStateCodec`) — короткий hex + in-memory mapping,
 *   одноразовый, TTL 5 минут. Используется Точкой, которая режет state >32 символов.
 */
export interface OAuthStateCodec<T extends OAuthState = OAuthState> {
  sign(s: T): string;
  verify(token: string): T;
}

/** JWT-кодек: `subject` изолирует state'ы разных банков друг от друга. */
export function createJwtStateCodec<T extends OAuthState = OAuthState>(
  subject: string,
): OAuthStateCodec<T> {
  return {
    sign(s: T): string {
      return jwt.sign({ ...s }, JWT_SECRET, { expiresIn: "5m", subject });
    },
    verify(token: string): T {
      const d = jwt.verify(token, JWT_SECRET, { subject }) as jwt.JwtPayload & T;
      return { ...d } as T;
    },
  };
}

/**
 * Nonce-кодек: 12-байтовый random hex (24 символа) + in-memory map.
 * Каждый verify съедает запись (одноразовый). При рестарте api state теряется —
 * приемлемо для 5-минутного OAuth-редиректа.
 */
export function createNonceStateCodec<T extends OAuthState = OAuthState>(): OAuthStateCodec<T> {
  interface Entry {
    state: T;
    expiresAt: number;
  }
  const store = new Map<string, Entry>();
  function sweep() {
    const now = Date.now();
    for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
  }
  return {
    sign(s: T): string {
      sweep();
      const nonce = randomBytes(12).toString("hex");
      store.set(nonce, { state: s, expiresAt: Date.now() + TTL_MS });
      return nonce;
    },
    verify(nonce: string): T {
      sweep();
      const entry = store.get(nonce);
      if (!entry) throw new Error("invalid or expired oauth state");
      store.delete(nonce);
      return entry.state;
    },
  };
}
