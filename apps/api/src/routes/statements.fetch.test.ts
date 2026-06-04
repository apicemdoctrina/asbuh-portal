import { describe, it, expect } from "vitest";
import { mapBankError } from "./statements.js";
import { BankConfigError, BankApiError } from "../lib/bank-adapters/index.js";

describe("mapBankError", () => {
  it("BankConfigError → 422 с сообщением", () => {
    const m = mapBankError(new BankConfigError("нет токена"));
    expect(m.status).toBe(422);
    expect(m.error).toBe("нет токена");
  });

  it("BankApiError → 502 с сообщением", () => {
    const m = mapBankError(new BankApiError("банк отклонил"));
    expect(m.status).toBe(502);
    expect(m.error).toBe("банк отклонил");
  });

  it("прочая ошибка → 500 без утечки деталей", () => {
    const m = mapBankError(new Error("stack secret"));
    expect(m.status).toBe(500);
    expect(m.error).toBe("Internal server error");
  });
});
