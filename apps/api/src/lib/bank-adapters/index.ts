import type { BankAdapter } from "./types.js";
import { tochkaAdapter } from "./tochka.js";
import { sberAdapter } from "./sber.js";
import { alfaAdapter } from "./alfa.js";

const ADAPTERS: Record<string, BankAdapter> = {
  tochka: tochkaAdapter,
  sber: sberAdapter,
  alfa: alfaAdapter,
};

export function getAdapter(provider: string | null | undefined): BankAdapter | null {
  if (!provider) return null;
  return ADAPTERS[provider] ?? null;
}

export { BankConfigError, BankApiError } from "./types.js";
export { resolveToken } from "./tochka.js";
