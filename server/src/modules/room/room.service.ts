import type Anthropic from "@anthropic-ai/sdk";
import type { InterviewRow } from "../../common/types.js";
import { HISTORY_SUMMARY_THRESHOLD, QUICK_MODEL } from "../../config/models.js";
import { query } from "../../infrastructure/db.js";
import {
  assertUserKey,
  complete,
  matchPreparedQuestion,
  predictFollowUps,
  streamStage,
} from "../ai/ai.service.js";
import {
  actionInstruction,
  detailInstruction,
  quickInstruction,
  systemBlocks,
} from "../ai/prompt.js";
import { buildHistory, interviewContext, loadInterview } from "../interviews/interview.context.js";
import {
  broadcast,
  clearInflight,
  startInflight,
} from "./sse-hub.js";

// --- Single-flight generation lock -----------------------------------------
// One in-flight answer per interview. The lock is acquired *synchronously* in
// the controller (beginGeneration) before any await, which closes the TOCTOU
// race where two concurrent asks could both pass a has()-check. It is released
// in exactly one place per request: generateAnswer's finally on the happy path,
// or the controller on a pre-generation failure.

const aborters = new Map<string, AbortController>();

// Try to acquire the lock. Returns a fresh AbortController, or null if a
// generation is already running for this interview. Synchronous and atomic.
export function beginGeneration(interviewId: string): AbortController | null {
  if (aborters.has(interviewId)) return null;
  const ac = new AbortController();
  aborters.set(interviewId, ac);
  return ac;
}

export function endGeneration(interviewId: string) {
  aborters.delete(interviewId);
  clearInflight(interviewId);
}

export function abortGeneration(interviewId: string) {
  aborters.get(interviewId)?.abort();
}

export interface GenerateArgs {
  interview: InterviewRow;
  question: string;
  action?: string;
  imageBlock: Anthropic.ImageBlockParam | null;
  aborter: AbortController;
}

// Two-stage detached generation: a fast "say now" line, then the full answer,
// both streamed over SSE. Persists the assistant message and always releases
// the generation lock. Uses the interview owner's Anthropic key (no fallback).
export async function generateAnswer({ interview, question, action, imageBlock, aborter }: GenerateArgs) {
  let messageId: string | null = null;
  let inflight: ReturnType<typeof startInflight> | null = null;

  try {
    // Fail fast if the owner has no key, before creating any rows.
    await assertUserKey(interview.owner_id);

    const ctx = await interviewContext(interview);
    const system = systemBlocks(ctx);
    const qa = ctx.qa;
    const history = await buildHistory(interview);

    // Create the assistant row up front so we have an id for the stream.
    const ins = await query<{ id: string }>(
      `INSERT INTO interview_messages (interview_id, role, kind, model, state)
       VALUES ($1,'assistant','answer',$2,'streaming') RETURNING id`,
      [interview.id, interview.model],
    );
    messageId = ins.rows[0].id;
    inflight = startInflight(interview.id, messageId);
    broadcast(interview.id, "answer_start", { messageId });

    // Non-blocking prepared-answer match for the label.
    let qaRef: string | null = null;
    const qaMatchPromise = matchPreparedQuestion(interview.owner_id, question, qa.map((q) => q.question)).then((idx) => {
      if (idx != null) {
        qaRef = `${idx}`;
        inflight!.qaRef = qaRef;
        broadcast(interview.id, "qa_match", { messageId, index: idx });
      }
    });

    // The user turn: image (if any) + question text.
    const questionBlocks: Anthropic.ContentBlockParam[] = [];
    if (imageBlock) questionBlocks.push(imageBlock);
    questionBlocks.push({ type: "text", text: question || "(see image)" });

    const extra = action ? `\n\n${actionInstruction(action)}` : "";

    // Stage 1: quick line (always fast model, thinking off).
    const quickMessages: Anthropic.MessageParam[] = [
      ...history,
      { role: "user", content: [...questionBlocks, { type: "text", text: quickInstruction(interview.interview_type) + extra }] },
    ];
    const quick = await streamStage({
      userId: interview.owner_id, model: QUICK_MODEL, system, messages: quickMessages, maxTokens: 200, thinkingOff: true,
      signal: aborter.signal,
      onDelta: (t) => { inflight!.quick += t; broadcast(interview.id, "quick_delta", { messageId, text: t }); },
    });
    broadcast(interview.id, "quick_done", { messageId, qaRef });

    // Stage 2: detail (interview's model, low effort), continues the quick line.
    const detailMessages: Anthropic.MessageParam[] = [
      ...history,
      { role: "user", content: [...questionBlocks, { type: "text", text: detailInstruction(interview.interview_type, quick.text) + extra }] },
    ];
    const detail = await streamStage({
      userId: interview.owner_id, model: interview.model, system, messages: detailMessages, maxTokens: 2048,
      effort: "low", cacheHistory: true, signal: aborter.signal,
      onDelta: (t) => { inflight!.content += t; broadcast(interview.id, "delta", { messageId, text: t }); },
    });

    await qaMatchPromise.catch(() => {});
    await query(
      `UPDATE interview_messages
          SET quick=$2, content=$3, qa_ref=$4, state='complete', quick_ms=$5, detail_ms=$6,
              input_tokens=$7, output_tokens=$8
        WHERE id=$1`,
      [messageId, quick.text, detail.text, qaRef, quick.ms, detail.ms, detail.inputTokens, detail.outputTokens],
    );
    broadcast(interview.id, "answer_done", { messageId, qaRef, quickMs: quick.ms, detailMs: detail.ms });

    // Likely follow-ups (after the answer; never delays it).
    predictFollowUps(interview.owner_id, question, detail.text).then(async (fu) => {
      if (fu.length === 0) return;
      await query(`UPDATE interview_messages SET follow_ups=$2 WHERE id=$1`, [messageId, JSON.stringify(fu)]);
      broadcast(interview.id, "follow_ups", { messageId, followUps: fu });
    }).catch(() => {});

    // History safety net.
    if (detail.inputTokens > HISTORY_SUMMARY_THRESHOLD) {
      rollUpHistory(interview.id).catch((e) => console.error("rollup failed", e));
    }
  } catch (err) {
    const aborted = aborter.signal.aborted || (err as { name?: string })?.name === "AbortError";
    if (messageId) {
      await query(
        `UPDATE interview_messages SET quick=$2, content=$3, state=$4 WHERE id=$1`,
        [messageId, inflight?.quick ?? "", inflight?.content ?? "", aborted ? "stopped" : "error"],
      );
      broadcast(interview.id, aborted ? "answer_done" : "answer_error", {
        messageId, stopped: aborted, message: aborted ? undefined : ((err as Error)?.message ?? "Generation error"),
      });
    } else {
      // Failed before any row existed (e.g. missing API key).
      broadcast(interview.id, "answer_error", { message: (err as Error)?.message ?? "Generation failed" });
    }
  } finally {
    endGeneration(interview.id);
  }
}

// Fold the earliest turns into interviews.history_summary when the context sent
// grows past the threshold. Keeps the full transcript in the database.
export async function rollUpHistory(interviewId: string) {
  const interview = await loadInterview(interviewId);
  if (!interview) return;
  const { rows } = await query<{ id: string; role: string; quick: string | null; content: string }>(
    `SELECT id, role, quick, content FROM interview_messages
      WHERE interview_id=$1 AND kind IN ('question','answer')
        ${interview.history_summary_upto ? "AND created_at > (SELECT created_at FROM interview_messages WHERE id=$2)" : ""}
      ORDER BY created_at ASC`,
    interview.history_summary_upto ? [interviewId, interview.history_summary_upto] : [interviewId],
  );
  // Summarise all but the last 6 turns.
  const keep = 6;
  if (rows.length <= keep) return;
  const toFold = rows.slice(0, rows.length - keep);
  const upto = toFold[toFold.length - 1].id;
  const transcript = toFold
    .map((r) => (r.role === "user" ? `Q: ${r.content}` : `A: ${[r.quick, r.content].filter(Boolean).join(" ")}`))
    .join("\n");
  const text = await complete({
    userId: interview.owner_id,
    model: QUICK_MODEL,
    maxTokens: 1500,
    system: "Summarise this interview transcript so far into compact notes that preserve what was asked and answered.",
    messages: [
      ...(interview.history_summary ? [{ role: "user" as const, content: `Existing summary:\n${interview.history_summary}` }] : []),
      { role: "user", content: transcript },
    ],
  });
  await query(`UPDATE interviews SET history_summary=$2, history_summary_upto=$3 WHERE id=$1`, [interviewId, text, upto]);
}
