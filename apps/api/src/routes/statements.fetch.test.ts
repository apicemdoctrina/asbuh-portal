import { describe, it, expect } from "vitest";
import { mapBankError } from "./statements/helpers.js";
import { buildAuthorizeUrl } from "./statements/oauth-sber.js";
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

describe("buildAuthorizeUrl", () => {
  it("содержит обязательные OAuth-параметры", () => {
    const url = buildAuthorizeUrl(
      {
        authBaseUrl: "https://sso.sber.test",
        clientId: "cid",
        redirectUri: "https://app.test/api/statements/sber/callback",
        scope: "openid GET_STATEMENT_ACCOUNT",
      },
      "the-state",
    );
    expect(url).toContain("https://sso.sber.test/ic/sso/api/v2/oauth/authorize?");
    expect(url).toContain("response_type=code");
    expect(url).toContain("client_id=cid");
    expect(url).toContain("scope=openid+GET_STATEMENT_ACCOUNT");
    expect(url).toContain("state=the-state");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fapp.test");
  });
});
