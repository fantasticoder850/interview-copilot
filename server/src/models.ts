export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", description: "Most capable" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", description: "Balanced" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", description: "Fastest" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const MODEL_IDS: string[] = MODELS.map((m) => m.id);

export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

export function isValidModel(id: unknown): id is ModelId {
  return typeof id === "string" && MODEL_IDS.includes(id);
}
