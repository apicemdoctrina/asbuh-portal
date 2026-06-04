import { describe, it, expect } from "vitest";
import { getSberConfig } from "./sber-mtls.js";
import { BankConfigError } from "./types.js";

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
