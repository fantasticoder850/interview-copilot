import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { assignManagerToCandidate, cookieFor, createUser } from "./helpers/factories.js";
import { prepareTestDatabase, resetDb } from "./helpers/test-db.js";

const app = createApp();
const ok = await prepareTestDatabase();
const d = ok ? describe : describe.skip;

async function interviewing() {
  const manager = await createUser({ role: "manager" });
  const candidate = await createUser({ role: "candidate" });
  await assignManagerToCandidate(manager.id, candidate.id);
  const created = await request(app).post("/api/interviews").set("Cookie", cookieFor(manager.id)).send({
    jobTitle: "Room", model: "claude-opus-5-5", candidateIds: [candidate.id],
  });
  const id = created.body.id;
  await request(app).post(`/api/interviews/${id}/status`).set("Cookie", cookieFor(manager.id)).send({ status: "interviewing" });
  return { manager, candidate, id };
}

d("interview room", () => {
  beforeEach(resetDb);

  it("refuses a question when the interview is not in progress", async () => {
    const manager = await createUser({ role: "manager" });
    const candidate = await createUser({ role: "candidate" });
    await assignManagerToCandidate(manager.id, candidate.id);
    const created = await request(app).post("/api/interviews").set("Cookie", cookieFor(manager.id)).send({
      jobTitle: "Scheduled", model: "claude-opus-5-5", candidateIds: [candidate.id],
    });
    const res = await request(app).post(`/api/interviews/${created.body.id}/messages`)
      .set("Cookie", cookieFor(manager.id)).send({ content: "Hi" });
    expect(res.status).toBe(409);
  });

  it("accepts a question (202) and persists it to the transcript", async () => {
    const { candidate, id } = await interviewing();
    const ask = await request(app).post(`/api/interviews/${id}/messages`)
      .set("Cookie", cookieFor(candidate.id)).send({ content: "Tell me about yourself" });
    expect(ask.status).toBe(202);
    expect(ask.body.questionId).toBeTruthy();

    const transcript = await request(app).get(`/api/interviews/${id}/messages`).set("Cookie", cookieFor(candidate.id));
    const question = transcript.body.find((m: { kind: string }) => m.kind === "question");
    expect(question).toBeTruthy();
    expect(question.content).toBe("Tell me about yourself");
  });

  it("lets a manager add a note but forbids a candidate", async () => {
    const { manager, candidate, id } = await interviewing();
    const asManager = await request(app).post(`/api/interviews/${id}/notes`)
      .set("Cookie", cookieFor(manager.id)).send({ content: "Watch the pacing" });
    expect(asManager.status).toBe(201);

    const asCandidate = await request(app).post(`/api/interviews/${id}/notes`)
      .set("Cookie", cookieFor(candidate.id)).send({ content: "sneaky" });
    expect(asCandidate.status).toBe(403);
  });

  it("denies transcript access to an unrelated user", async () => {
    const { id } = await interviewing();
    const stranger = await createUser({ role: "manager" });
    const res = await request(app).get(`/api/interviews/${id}/messages`).set("Cookie", cookieFor(stranger.id));
    expect(res.status).toBe(404);
  });
});
