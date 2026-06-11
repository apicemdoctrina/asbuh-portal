import { describe, it, expect, vi } from "vitest";
import { getSberConfig } from "./sber-mtls.js";
import { refreshAccessToken, exchangeAuthCode } from "./sber-client.js";
import { BankConfigError, BankApiError } from "./types.js";

const cfg = {
  baseUrl: "https://sber.test",
  authBaseUrl: "https://sso.sber.test",
  redirectUri: "https://app.test/api/statements/sber/callback",
  clientId: "cid",
  clientSecret: "secret",
  scope: "openid statements",
  dispatcher: undefined as never, // в тестах fetch замокан, диспетчер не используется
};

describe("getSberConfig", () => {
  it("без env SBER_* → BankConfigError", () => {
    const keys = [
      "SBER_API_BASE",
      "SBER_CLIENT_ID",
      "SBER_CLIENT_SECRET",
      "SBER_CERT_PATH",
      "SBER_CERT_KEY_PATH",
    ];
    const saved: Record<string, string | undefined> = {};
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    try {
      expect(() => getSberConfig()).toThrow(BankConfigError);
    } finally {
      for (const k of keys) if (saved[k] !== undefined) process.env[k] = saved[k];
    }
  });
});

describe("refreshAccessToken", () => {
  it("успех + ротация refresh → возвращает новые токены", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "acc-new", refresh_token: "ref-new" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await refreshAccessToken("ref-old", cfg);
    expect(res.accessToken).toBe("acc-new");
    expect(res.refreshToken).toBe("ref-new");
    vi.unstubAllGlobals();
  });

  it("401 → BankApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "denied" }),
    );
    await expect(refreshAccessToken("ref-old", cfg)).rejects.toBeInstanceOf(BankApiError);
    vi.unstubAllGlobals();
  });
});

describe("exchangeAuthCode", () => {
  it("успех → токены", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "acc", refresh_token: "ref" }),
      }),
    );
    const res = await exchangeAuthCode("the-code", cfg);
    expect(res.accessToken).toBe("acc");
    expect(res.refreshToken).toBe("ref");
    vi.unstubAllGlobals();
  });

  it("401 → BankApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "denied" }),
    );
    await expect(exchangeAuthCode("the-code", cfg)).rejects.toBeInstanceOf(BankApiError);
    vi.unstubAllGlobals();
  });
});
