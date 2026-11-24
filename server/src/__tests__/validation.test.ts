import { describe, expect, it } from "vitest";
import { accountSchema, interviewSchema, registerSchema, zodMessage } from "../validation.js";

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    const r = registerSchema.safeParse({
      name: "Jane", email: "jane@example.com", password: "longenough", requestedRole: "candidate",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a short password, bad email, and bad role", () => {
    expect(registerSchema.safeParse({ name: "J", email: "x@y.z", password: "short", requestedRole: "candidate" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "J", email: "nope", password: "longenough", requestedRole: "candidate" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "J", email: "x@y.z", password: "longenough", requestedRole: "admin" }).success).toBe(false);
  });
});

describe("interviewSchema", () => {
  it("applies defaults", () => {
    const r = interviewSchema.safeParse({ jobTitle: "Backend Engineer", model: "claude-opus-5-5" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.interviewType).toBe("intro");
      expect(r.data.answerLanguage).toBe("English");
      expect(r.data.candidateIds).toEqual([]);
    }
  });

  it("requires a job title", () => {
    expect(interviewSchema.safeParse({ model: "claude-opus-5-5" }).success).toBe(false);
  });
});

describe("accountSchema", () => {
  it("rejects an empty update", () => {
    expect(accountSchema.safeParse({}).success).toBe(false);
  });
  it("accepts a name-only update", () => {
    expect(accountSchema.safeParse({ name: "New Name" }).success).toBe(true);
  });
});

describe("zodMessage", () => {
  it("formats issues into a flat string", () => {
    const r = registerSchema.safeParse({ name: "", email: "bad", password: "x", requestedRole: "nope" });
    if (!r.success) {
      const msg = zodMessage(r.error);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    } else {
      throw new Error("expected failure");
    }
  });
});
