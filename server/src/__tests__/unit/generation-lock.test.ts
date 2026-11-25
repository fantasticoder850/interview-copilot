import { afterEach, describe, expect, it } from "vitest";
import { beginGeneration, endGeneration } from "../../modules/room/room.service.js";

const IV = "11111111-1111-1111-1111-111111111111";

describe("single-flight generation lock", () => {
  afterEach(() => endGeneration(IV));

  it("grants the lock once, then refuses until released", () => {
    const a = beginGeneration(IV);
    expect(a).not.toBeNull();
    // A second acquisition while held must fail — this is the race the fix closes.
    expect(beginGeneration(IV)).toBeNull();
    endGeneration(IV);
    // After release the lock is available again.
    const b = beginGeneration(IV);
    expect(b).not.toBeNull();
    expect(b).not.toBe(a);
  });

  it("returns an abortable controller", () => {
    const ac = beginGeneration(IV)!;
    expect(ac.signal.aborted).toBe(false);
    ac.abort();
    expect(ac.signal.aborted).toBe(true);
  });
});
