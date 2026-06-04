import { createHash } from "node:crypto";

export interface OpHashInput {
  accountNumber: string;
  date: string; // DD.MM.YYYY
  amount: number;
  direction: "in" | "out";
  number: string;
  purpose: string | null;
}

/** Стабильный ключ операции для дедупа перекрывающихся выписок. */
export function opHash(input: OpHashInput): string {
  const key = [
    input.accountNumber,
    input.date,
    input.amount.toFixed(2),
    input.direction,
    input.number,
    input.purpose ?? "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}
