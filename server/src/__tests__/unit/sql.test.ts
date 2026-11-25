import { describe, expect, it } from "vitest";
import { buildUpdate } from "../../common/sql.js";

const MAP = { name: "name", role: "role", content: "content" } as const;

describe("buildUpdate", () => {
  it("emits a positional assignment per present field", () => {
    const { assignments, values } = buildUpdate(MAP, { name: "Jane", content: "x" });
    expect(assignments).toEqual(["name = $1", "content = $2"]);
    expect(values).toEqual(["Jane", "x"]);
  });

  it("skips undefined fields but keeps nulls and empty strings", () => {
    const { assignments, values } = buildUpdate(MAP, { name: undefined, role: null, content: "" });
    expect(assignments).toEqual(["role = $1", "content = $2"]);
    expect(values).toEqual([null, ""]);
  });

  it("returns empty for no present fields", () => {
    const { assignments, values } = buildUpdate(MAP, {});
    expect(assignments).toEqual([]);
    expect(values).toEqual([]);
  });

  it("only emits columns from the map (ignores stray keys)", () => {
    const { assignments } = buildUpdate(MAP, { name: "a", evil: "DROP" } as never);
    expect(assignments).toEqual(["name = $1"]);
  });
});
