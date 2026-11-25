export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", description: "Most capable" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", description: "Balanced" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", description: "Fastest" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const MODEL_IDS: string[] = MODELS.map((m) => m.id);

export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

// The model used for the fast "say now" line and background helper calls
// (follow-up prediction), regardless of the interview's chosen model.
export const QUICK_MODEL: ModelId = "claude-haiku-5-5";

// The model used for utility one-shots (resume parsing, answer drafting).
export const UTILITY_MODEL: ModelId = "claude-sonnet-5-5";

// When the tokens sent on a request would exceed this, fold the oldest turns
// into interviews.history_summary. All current models have a 1M window; this
// keeps cost and latency bounded on very long or repeatedly-resumed interviews.
export const HISTORY_SUMMARY_THRESHOLD = Number(
  process.env.HISTORY_SUMMARY_THRESHOLD ?? 150_000,
);

export function isValidModel(id: unknown): id is ModelId {
  return typeof id === "string" && MODEL_IDS.includes(id);
}
