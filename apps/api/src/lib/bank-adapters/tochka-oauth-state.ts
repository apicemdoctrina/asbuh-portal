import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const SUBJECT = "tochka-oauth";

export interface TochkaState {
  bankAccountId: string;
  userId: string;
}

export function signTochkaState(s: TochkaState): string {
  return jwt.sign({ bankAccountId: s.bankAccountId, userId: s.userId }, JWT_SECRET, {
    expiresIn: "5m",
    subject: SUBJECT,
  });
}

export function verifyTochkaState(token: string): TochkaState {
  const d = jwt.verify(token, JWT_SECRET, { subject: SUBJECT }) as jwt.JwtPayload & TochkaState;
  return { bankAccountId: d.bankAccountId, userId: d.userId };
}
