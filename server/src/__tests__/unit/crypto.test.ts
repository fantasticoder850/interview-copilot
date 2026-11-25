import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../../infrastructure/crypto.js";

describe("crypto", () => {
  it("round-trips a secret", () => {
    const secret = "sk-ant-abc123-XYZ";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("round-trips unicode and empty strings", () => {
    expect(decryptSecret(encryptSecret("héllo 🌍"))).toBe("héllo 🌍");
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });

  it("rejects a tampered ciphertext", () => {
    const blob = encryptSecret("secret");
    const raw = Buffer.from(blob, "base64");
    raw[raw.length - 1] ^= 0xff; // flip a bit in the ciphertext
    expect(() => decryptSecret(raw.toString("base64"))).toThrow();
  });
});
