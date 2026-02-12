import { describe, it, expect } from "vitest";
import { hashPassword, comparePassword } from "./password.js";

describe("password", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("MySecret123!");
    expect(hash).not.toBe("MySecret123!");
    expect(await comparePassword("MySecret123!", hash)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct");
    expect(await comparePassword("wrong", hash)).toBe(false);
  });
});
