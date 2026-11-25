import type Anthropic from "@anthropic-ai/sdk";
import { UpstreamAIError } from "../../common/errors.js";
import { QUICK_MODEL } from "../../config/models.js";
import { clientForUser } from "../../infrastructure/anthropic/client.js";

// Centralised Anthropic access. Every `client.messages.*` call in the app goes
// through this module; callers pass the id of the user whose key pays for the
// call (the interview owner, or the acting user for utility calls) plus plain
// prompt/message data. No SQL and no transport concerns live here.

// Resolve (and cache) the user's client, discarding it — throws
// MissingApiKeyError when the user has no key. Lets callers fail fast before
// doing other work, without importing the provider client themselves.
export async function assertUserKey(userId: string): Promise<void> {
  await clientForUser(userId);
}

export interface StageResult {
  text: string;
  ms: number; // time to first token
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

export interface StreamStageInput {
  userId: string;
  model: string;
  system: Anthropic.MessageCreateParams["system"];
  messages: Anthropic.MessageParam[];
  maxTokens: number;
  thinkingOff?: boolean;
  effort?: "low" | "medium" | "high";
  cacheHistory?: boolean;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

// Streams one model call, invoking onDelta per text chunk. Returns the full
// text, time-to-first-token, and usage. Checks stop_reason so a refusal or
// truncation surfaces instead of a silent empty answer.
export async function streamStage(input: StreamStageInput): Promise<StageResult> {
  const client = await clientForUser(input.userId);
  const started = Date.now();
  let firstTokenAt = 0;
  let text = "";

  // The SDK's typed params don't cover every passthrough field (thinking,
  // output_config, top-level cache_control), so the extension object is built
  // loosely and cast once here at the provider boundary.
  const params: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: input.messages,
  };
  if (input.thinkingOff) params.thinking = { type: "disabled" };
  if (input.effort) params.output_config = { effort: input.effort };
  if (input.cacheHistory) params.cache_control = { type: "ephemeral" };

  const stream = client.messages.stream(params as Anthropic.MessageStreamParams);
  if (input.signal) {
    input.signal.addEventListener("abort", () => stream.abort(), { once: true });
  }

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      if (firstTokenAt === 0) firstTokenAt = Date.now();
      text += event.delta.text;
      input.onDelta(event.delta.text);
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error("The model declined to answer this question.");
  }
  return {
    text,
    ms: (firstTokenAt || Date.now()) - started,
    inputTokens: final.usage.input_tokens ?? 0,
    outputTokens: final.usage.output_tokens ?? 0,
    stopReason: final.stop_reason ?? null,
  };
}

export interface CompleteInput {
  userId: string;
  model: string;
  maxTokens: number;
  messages: Anthropic.MessageParam[];
  system?: Anthropic.MessageCreateParams["system"];
}

// One-shot, non-streaming completion returning the joined text. Replaces the
// duplicated `messages.create(...) + filter text blocks` pattern that lived in
// the interview, resume, and room route files. Provider failures (other than a
// MissingApiKeyError raised while resolving the key) become an UpstreamAIError.
export async function complete(input: CompleteInput): Promise<string> {
  const client = await clientForUser(input.userId);
  try {
    const msg = await client.messages.create({
      model: input.model,
      max_tokens: input.maxTokens,
      ...(input.system !== undefined ? { system: input.system } : {}),
      messages: input.messages,
    });
    return textOf(msg);
  } catch (err) {
    // Log the real provider error; surface a generic message so provider
    // internals never reach the client.
    console.error("AI completion failed:", err);
    throw new UpstreamAIError();
  }
}

// Fire-and-forget warm-up: primes the prompt cache for a model. Never throws.
export async function warmModel(
  userId: string,
  model: string,
  system: Anthropic.MessageCreateParams["system"],
): Promise<void> {
  try {
    const client = await clientForUser(userId);
    await client.messages.create({
      model,
      max_tokens: 1,
      system,
      messages: [{ role: "user", content: "ready?" }],
    });
  } catch {
    /* best-effort cache warm; ignore failures */
  }
}

// Best-effort, non-blocking match of a question to a prepared Q&A index.
// Runs on the fast model; returns the matched index or null.
export async function matchPreparedQuestion(
  userId: string,
  question: string,
  questions: string[],
): Promise<number | null> {
  if (questions.length === 0) return null;
  try {
    const client = await clientForUser(userId);
    const list = questions.map((q, i) => `${i}: ${q}`).join("\n");
    const msg = await client.messages.create({
      model: QUICK_MODEL,
      max_tokens: 10,
      thinking: { type: "disabled" },
      system:
        "You match an interview question to a prepared question by meaning. " +
        "Reply with ONLY the number of the best match, or -1 if none matches.\n\n" +
        "PREPARED QUESTIONS:\n" + list,
      messages: [{ role: "user", content: question }],
    });
    const n = parseInt(textOf(msg), 10);
    return Number.isInteger(n) && n >= 0 && n < questions.length ? n : null;
  } catch {
    return null;
  }
}

// Predict up to two likely follow-up questions after an answer. Non-blocking.
export async function predictFollowUps(
  userId: string,
  question: string,
  answer: string,
): Promise<string[]> {
  try {
    const client = await clientForUser(userId);
    const msg = await client.messages.create({
      model: QUICK_MODEL,
      max_tokens: 120,
      thinking: { type: "disabled" },
      system:
        "Given an interview question and the candidate's answer, list up to TWO likely " +
        "follow-up questions the interviewer may ask next. Reply as a JSON array of strings only.",
      messages: [{ role: "user", content: `Q: ${question}\nA: ${answer}` }],
    });
    const parsed = JSON.parse(textOf(msg));
    return Array.isArray(parsed) ? parsed.slice(0, 2).map(String) : [];
  } catch {
    return [];
  }
}

// Join the text blocks of a completed message.
export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
