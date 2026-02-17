import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto.js";

describe("crypto", () => {
  it("encrypt → decrypt roundtrip returns original plaintext", () => {
    const plaintext = "my-secret-login";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("encrypted string starts with enc_v1: prefix", () => {
    const encrypted = encrypt("test");
    expect(encrypted.startsWith("enc_v1:")).toBe(true);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encrypt("same-value");
    const b = encrypt("same-value");
    expect(a).not.toBe(b);
    // Both should decrypt to the same value
    expect(decrypt(a)).toBe("same-value");
    expect(decrypt(b)).toBe("same-value");
  });

  it("decrypt throws on corrupted data", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    // Corrupt the ciphertext
    parts[3] = "ff".repeat(parts[3].length / 2);
    const corrupted = parts.join(":");
    expect(() => decrypt(corrupted)).toThrow();
  });

  it("decrypt throws on invalid format (no enc_v1 prefix)", () => {
    expect(() => decrypt("not-encrypted-data")).toThrow("Invalid encrypted data format");
  });

  it("handles empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles unicode characters", () => {
    const plaintext = "Пароль123!@#";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });
});
