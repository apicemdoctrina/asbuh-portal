import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const SUBJECT = "sber-oauth";

export interface SberState {
  bankAccountId: string;
  userId: string;
}

/** Подписать короткоживущий state (CSRF + привязка к счёту). */
export function signSberState(s: SberState): string {
  return jwt.sign({ bankAccountId: s.bankAccountId, userId: s.userId }, JWT_SECRET, {
    expiresIn: "5m",
    subject: SUBJECT,
  });
}

/** Проверить и распарсить state. Бросает при невалидном/протухшем/чужом токене. */
export function verifySberState(token: string): SberState {
  const d = jwt.verify(token, JWT_SECRET, { subject: SUBJECT }) as jwt.JwtPayload & SberState;
  return { bankAccountId: d.bankAccountId, userId: d.userId };
}
