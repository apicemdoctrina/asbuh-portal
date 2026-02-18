import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, setAccessToken, clearAccessToken, getAccessToken } from "./api.js";

beforeEach(() => {
  clearAccessToken();
  globalThis.fetch = vi.fn();
});

describe("api", () => {
  it("adds Authorization header when token is set", async () => {
    setAccessToken("test-token");
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
    );

    await api("/api/users/me");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/users/me"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("attempts refresh on 401", async () => {
    setAccessToken("expired-token");

    globalThis.fetch = vi
      .fn()
      // First call: /api/users/me returns 401
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })
      // Second call: /api/auth/refresh returns new token
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ accessToken: "new-token" }),
      })
      // Third call: retry /api/users/me with new token
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: "1" }),
      });

    const res = await api("/api/users/me");

    expect(res.ok).toBe(true);
    expect(getAccessToken()).toBe("new-token");
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("clears token when refresh fails", async () => {
    setAccessToken("expired-token");

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 401 });

    const res = await api("/api/users/me");

    expect(res.status).toBe(401);
    expect(getAccessToken()).toBeNull();
  });
});
