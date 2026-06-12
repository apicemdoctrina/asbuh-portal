import { describe, it, expect, vi, afterEach } from "vitest";
import { postOAuthToken } from "./oauth-token.js";
import { BankApiError } from "./types.js";

const baseOpts = {
  url: "https://bank.test/token",
  params: { grant_type: "refresh_token", client_id: "cid", refresh_token: "ref-old" },
  authRejectMessage: "Банк отклонил авторизацию",
  apiErrorPrefix: "Банк: ошибка token",
  missingTokenMessage: "Банк не вернул access_token",
};

function mockFetch(res: Partial<Response> & Record<string, unknown>) {
  const fn = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postOAuthToken", () => {
  it("happy path: POST form-urlencoded, возвращает оба токена", async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "acc-new", refresh_token: "ref-new" }),
    });

    const res = await postOAuthToken(baseOpts);

    expect(res).toEqual({ accessToken: "acc-new", refreshToken: "ref-new" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bank.test/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=refresh_token&client_id=cid&refresh_token=ref-old",
      }),
    );
  });

  it("банк не ротирует refresh → возвращается входной params.refresh_token", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "acc-new" }),
    });

    const res = await postOAuthToken(baseOpts);

    expect(res.accessToken).toBe("acc-new");
    expect(res.refreshToken).toBe("ref-old");
  });

  it("401 → BankApiError с authRejectMessage", async () => {
    mockFetch({ ok: false, status: 401, text: async () => "denied" });

    const err = await postOAuthToken(baseOpts).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(BankApiError);
    expect((err as Error).message).toBe("Банк отклонил авторизацию");
  });

  it("403 → BankApiError с authRejectMessage", async () => {
    mockFetch({ ok: false, status: 403, text: async () => "forbidden" });

    await expect(postOAuthToken(baseOpts)).rejects.toThrow("Банк отклонил авторизацию");
  });

  it("прочий non-OK без includeBodyInError → `<prefix> <status>` без тела", async () => {
    mockFetch({ ok: false, status: 500, text: async () => "secret internals" });

    const err = await postOAuthToken(baseOpts).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(BankApiError);
    expect((err as Error).message).toBe("Банк: ошибка token 500");
  });

  it("includeBodyInError → первые 200 символов тела в сообщении", async () => {
    const longBody = "x".repeat(300);
    mockFetch({ ok: false, status: 422, text: async () => longBody });

    await expect(postOAuthToken({ ...baseOpts, includeBodyInError: true })).rejects.toThrow(
      `Банк: ошибка token 422: ${"x".repeat(200)}`,
    );
  });

  it("includeBodyInError + упавший text() → сообщение без тела", async () => {
    mockFetch({ ok: false, status: 502, text: async () => Promise.reject(new Error("boom")) });

    await expect(postOAuthToken({ ...baseOpts, includeBodyInError: true })).rejects.toThrow(
      "Банк: ошибка token 502",
    );
  });

  it("200 без access_token → BankApiError с missingTokenMessage", async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({ refresh_token: "ref" }) });

    await expect(postOAuthToken(baseOpts)).rejects.toThrow("Банк не вернул access_token");
  });

  it("expectRefresh: ответ без refresh_token → BankApiError (authorization_code flow)", async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({ access_token: "acc" }) });

    await expect(postOAuthToken({ ...baseOpts, expectRefresh: true })).rejects.toThrow(
      "Банк не вернул access_token",
    );
  });

  it("без refresh в ответе и без params.refresh_token → пустая строка (client_credentials)", async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({ access_token: "acc" }) });

    const res = await postOAuthToken({
      ...baseOpts,
      params: { grant_type: "client_credentials", client_id: "cid" },
    });

    expect(res).toEqual({ accessToken: "acc", refreshToken: "" });
  });
});
