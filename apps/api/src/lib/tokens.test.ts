import { describe, it, expect } from "vitest";
import { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken } from "./tokens.js";

describe("tokens", () => {
  it("signs and verifies an access token", () => {
    const payload = { userId: "abc-123", roles: ["admin"] };
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe("abc-123");
    expect(decoded.roles).toEqual(["admin"]);
  });

  it("throws on invalid token", () => {
    expect(() => verifyAccessToken("invalid-token")).toThrow();
  });

  it("generates a refresh token (96 hex chars)", () => {
    const token = generateRefreshToken();
    expect(token).toHaveLength(96);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it("hashes a token deterministically", () => {
    const token = "test-token";
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(token);
  });
});
