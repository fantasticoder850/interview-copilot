import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MODEL_IDS, QUICK_MODEL, isValidModel } from "../../config/models.js";

describe("models", () => {
  it("accepts the three known models", () => {
    expect(isValidModel("claude-opus-5-5")).toBe(true);
    expect(isValidModel("claude-sonnet-5-5")).toBe(true);
    expect(isValidModel("claude-haiku-5-5")).toBe(true);
  });

  it("rejects unknown or non-string ids", () => {
    expect(isValidModel("gpt-4")).toBe(false);
    expect(isValidModel("")).toBe(false);
    expect(isValidModel(undefined)).toBe(false);
    expect(isValidModel(123)).toBe(false);
  });

  it("has valid default and quick models", () => {
    expect(MODEL_IDS).toContain(DEFAULT_MODEL);
    expect(MODEL_IDS).toContain(QUICK_MODEL);
  });
});
