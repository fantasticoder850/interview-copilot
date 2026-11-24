import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "../auth/tokens.js";

describe("tokens", () => {
  it("signs and verifies a user id", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const token = signToken(id);
    expect(typeof token).toBe("string");
    expect(verifyToken(token)).toBe(id);
  });

  it("returns null for a malformed token", () => {
    expect(verifyToken("not-a-jwt")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  it("returns null for a tampered token", () => {
    const token = signToken("abc");
    expect(verifyToken(token + "x")).toBeNull();
  });
});
