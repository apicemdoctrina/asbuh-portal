import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const SUBJECT = "alfa-oauth";

export interface AlfaState {
  bankAccountId: string;
  userId: string;
}

/** Подписать короткоживущий state (CSRF + привязка к счёту). */
export function signAlfaState(s: AlfaState): string {
  return jwt.sign({ bankAccountId: s.bankAccountId, userId: s.userId }, JWT_SECRET, {
    expiresIn: "5m",
    subject: SUBJECT,
  });
}

/** Проверить и распарсить state. Бросает при невалидном/протухшем/чужом токене. */
export function verifyAlfaState(token: string): AlfaState {
  const d = jwt.verify(token, JWT_SECRET, { subject: SUBJECT }) as jwt.JwtPayload & AlfaState;
  return { bankAccountId: d.bankAccountId, userId: d.userId };
}
