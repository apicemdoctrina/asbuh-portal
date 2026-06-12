import { describe, it, expect, vi, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { createJwtStateCodec, createNonceStateCodec } from "./oauth-state.js";
import { signAlfaState, verifyAlfaState } from "./alfa-oauth-state.js";

// JWT_SECRET задан в vitest.config.ts (test.env) — тот же, что читает oauth-state.ts
const SECRET = process.env.JWT_SECRET ?? "";

describe("createJwtStateCodec", () => {
  it("round-trip sign → verify", () => {
    const codec = createJwtStateCodec("test-bank");
    const token = codec.sign({ bankAccountId: "acc-1", userId: "user-1" });
    const s = codec.verify(token);
    expect(s.bankAccountId).toBe("acc-1");
    expect(s.userId).toBe("user-1");
  });

  it("subject изолирует state'ы разных банков", () => {
    const codecA = createJwtStateCodec("bank-a");
    const codecB = createJwtStateCodec("bank-b");
    const token = codecA.sign({ bankAccountId: "acc", userId: "u" });
    expect(() => codecB.verify(token)).toThrow();
  });

  it("мусорная строка → бросает", () => {
    const codec = createJwtStateCodec("test-bank");
    expect(() => codec.verify("not-a-jwt")).toThrow();
  });

  it("подпись чужим секретом → бросает", () => {
    const codec = createJwtStateCodec("test-bank");
    const fake = jwt.sign({ bankAccountId: "x", userId: "y" }, "WRONG_SECRET", {
      subject: "test-bank",
    });
    expect(() => codec.verify(fake)).toThrow();
  });

  it("просроченный токен → бросает", () => {
    const codec = createJwtStateCodec("test-bank");
    const expired = jwt.sign({ bankAccountId: "x", userId: "y" }, SECRET, {
      subject: "test-bank",
      expiresIn: -10,
    });
    expect(() => codec.verify(expired)).toThrow();
  });
});

describe("alfa oauth state (тонкая обёртка над JWT-кодеком)", () => {
  it("round-trip sign → verify", () => {
    const token = signAlfaState({ bankAccountId: "acc-7", userId: "user-7" });
    const s = verifyAlfaState(token);
    expect(s.bankAccountId).toBe("acc-7");
    expect(s.userId).toBe("user-7");
  });

  it("не принимает state с чужим subject", () => {
    const foreign = createJwtStateCodec("sber-oauth").sign({ bankAccountId: "a", userId: "u" });
    expect(() => verifyAlfaState(foreign)).toThrow();
  });
});

describe("createNonceStateCodec", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trip: короткий hex-nonce, одноразовый verify", () => {
    const codec = createNonceStateCodec();
    const nonce = codec.sign({ bankAccountId: "acc-1", userId: "user-1" });

    expect(nonce).toMatch(/^[0-9a-f]{24}$/);
    expect(codec.verify(nonce)).toEqual({ bankAccountId: "acc-1", userId: "user-1" });
    // второй verify того же nonce — уже съеден
    expect(() => codec.verify(nonce)).toThrow("invalid or expired oauth state");
  });

  it("неизвестный nonce → бросает", () => {
    const codec = createNonceStateCodec();
    expect(() => codec.verify("deadbeefdeadbeefdeadbeef")).toThrow(
      "invalid or expired oauth state",
    );
  });

  it("просрочка по TTL (5 минут) → бросает", () => {
    vi.useFakeTimers();
    const codec = createNonceStateCodec();
    const nonce = codec.sign({ bankAccountId: "acc-1", userId: "user-1" });

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(() => codec.verify(nonce)).toThrow("invalid or expired oauth state");
  });

  it("до истечения TTL nonce валиден", () => {
    vi.useFakeTimers();
    const codec = createNonceStateCodec();
    const nonce = codec.sign({ bankAccountId: "acc-1", userId: "user-1" });

    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(codec.verify(nonce).userId).toBe("user-1");
  });
});
