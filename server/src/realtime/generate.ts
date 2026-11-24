import type AnthropicSDK from "@anthropic-ai/sdk";
import { QUICK_MODEL } from "../models.js";

type Client = AnthropicSDK;

export interface StageResult {
  text: string;
  ms: number; // time to first token
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

interface StreamOpts {
  client: Client;
  model: string;
  system: AnthropicSDK.MessageCreateParams["system"];
  messages: AnthropicSDK.MessageParam[];
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
export async function streamStage(opts: StreamOpts): Promise<StageResult> {
  const started = Date.now();
  let firstTokenAt = 0;
  let text = "";

  const params: any = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: opts.messages,
  };
  if (opts.thinkingOff) params.thinking = { type: "disabled" };
  if (opts.effort) params.output_config = { effort: opts.effort };
  if (opts.cacheHistory) params.cache_control = { type: "ephemeral" };

  const stream = opts.client.messages.stream(params);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => stream.abort(), { once: true });
  }

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      if (firstTokenAt === 0) firstTokenAt = Date.now();
      text += event.delta.text;
      opts.onDelta(event.delta.text);
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

// Best-effort, non-blocking match of a question to a prepared Q&A index.
// Runs on the fast model; returns the matched index or null.
export async function matchPreparedQuestion(
  client: Client,
  question: string,
  questions: string[],
): Promise<number | null> {
  if (questions.length === 0) return null;
  try {
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
    const txt = msg.content
      .filter((b): b is AnthropicSDK.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const n = parseInt(txt, 10);
    return Number.isInteger(n) && n >= 0 && n < questions.length ? n : null;
  } catch {
    return null;
  }
}

// Predict up to two likely follow-up questions after an answer. Non-blocking.
export async function predictFollowUps(
  client: Client,
  question: string,
  answer: string,
): Promise<string[]> {
  try {
    const msg = await client.messages.create({
      model: QUICK_MODEL,
      max_tokens: 120,
      thinking: { type: "disabled" },
      system:
        "Given an interview question and the candidate's answer, list up to TWO likely " +
        "follow-up questions the interviewer may ask next. Reply as a JSON array of strings only.",
      messages: [{ role: "user", content: `Q: ${question}\nA: ${answer}` }],
    });
    const txt = msg.content
      .filter((b): b is AnthropicSDK.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed.slice(0, 2).map(String) : [];
  } catch {
    return [];
  }
}
