import { randomBytes } from "node:crypto";

const TTL_MS = 5 * 60 * 1000;

export interface TochkaState {
  bankAccountId: string;
  userId: string;
}

interface Entry {
  state: TochkaState;
  expiresAt: number;
}

const store = new Map<string, Entry>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
}

/** Подписать короткий random nonce (24 hex), запомнить mapping nonce → state на 5 минут. */
export function signTochkaState(s: TochkaState): string {
  sweep();
  const nonce = randomBytes(12).toString("hex");
  store.set(nonce, { state: s, expiresAt: Date.now() + TTL_MS });
  return nonce;
}

/** Распарсить nonce. Бросает, если nonce неизвестен или протух. */
export function verifyTochkaState(nonce: string): TochkaState {
  sweep();
  const entry = store.get(nonce);
  if (!entry) throw new Error("invalid or expired tochka state");
  store.delete(nonce); // одноразовый
  return entry.state;
}
