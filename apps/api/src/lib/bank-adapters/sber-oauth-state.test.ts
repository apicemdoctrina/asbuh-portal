import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { signSberState, verifySberState } from "./sber-oauth-state.js";

describe("sber oauth state", () => {
  it("round-trip sign → verify", () => {
    const token = signSberState({ bankAccountId: "acc-1", userId: "user-1" });
    const s = verifySberState(token);
    expect(s.bankAccountId).toBe("acc-1");
    expect(s.userId).toBe("user-1");
  });

  it("мусорная строка → бросает", () => {
    expect(() => verifySberState("not-a-jwt")).toThrow();
  });

  it("подпись чужим секретом → бросает", () => {
    const fake = jwt.sign({ bankAccountId: "x", userId: "y" }, "WRONG_SECRET", {
      subject: "sber-oauth",
    });
    expect(() => verifySberState(fake)).toThrow();
  });
});
