import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { assignManagerToCandidate, cookieFor, createResume, createUser } from "./helpers/factories.js";
import { prepareTestDatabase, resetDb } from "./helpers/test-db.js";

const app = createApp();
const ok = await prepareTestDatabase();
const d = ok ? describe : describe.skip;

// Create a manager with an assigned candidate and a resume, returning handles.
async function scenario() {
  const manager = await createUser({ role: "manager" });
  const candidate = await createUser({ role: "candidate" });
  await assignManagerToCandidate(manager.id, candidate.id);
  const resume = await createResume(manager.id);
  return { manager, candidate, resume };
}

async function createInterview(managerId: string, body: Record<string, unknown>) {
  return request(app).post("/api/interviews").set("Cookie", cookieFor(managerId)).send(body);
}

d("interviews", () => {
  beforeEach(resetDb);

  it("lets a manager create an interview for their own candidate", async () => {
    const { manager, candidate, resume } = await scenario();
    const res = await createInterview(manager.id, {
      jobTitle: "Backend Engineer", model: "claude-opus-5-5",
      resumeId: resume.id, candidateIds: [candidate.id],
    });
    expect(res.status).toBe(201);
    expect(res.body.job_title).toBe("Backend Engineer");
    expect(res.body.owner_id).toBe(manager.id);
  });

  it("rejects an invalid model and an unknown candidate", async () => {
    const { manager, resume } = await scenario();
    const badModel = await createInterview(manager.id, { jobTitle: "X", model: "gpt-4", resumeId: resume.id });
    expect(badModel.status).toBe(400);

    const stranger = await createUser({ role: "candidate" });
    const badCand = await createInterview(manager.id, {
      jobTitle: "X", model: "claude-opus-5-5", candidateIds: [stranger.id],
    });
    expect(badCand.status).toBe(403);
  });

  it("forbids a candidate from creating interviews", async () => {
    const candidate = await createUser({ role: "candidate" });
    const res = await createInterview(candidate.id, { jobTitle: "X", model: "claude-opus-5-5" });
    expect(res.status).toBe(403);
  });

  it("scopes the list by role", async () => {
    const { manager, candidate } = await scenario();
    const created = await createInterview(manager.id, {
      jobTitle: "Scoped", model: "claude-opus-5-5", candidateIds: [candidate.id],
    });
    const id = created.body.id;
    const other = await createUser({ role: "manager" });
    const admin = await createUser({ role: "admin" });

    const asOwner = await request(app).get("/api/interviews").set("Cookie", cookieFor(manager.id));
    expect(asOwner.body.map((i: { id: string }) => i.id)).toContain(id);

    const asOther = await request(app).get("/api/interviews").set("Cookie", cookieFor(other.id));
    expect(asOther.body.map((i: { id: string }) => i.id)).not.toContain(id);

    const asCandidate = await request(app).get("/api/interviews").set("Cookie", cookieFor(candidate.id));
    expect(asCandidate.body.map((i: { id: string }) => i.id)).toContain(id);

    const asAdmin = await request(app).get("/api/interviews").set("Cookie", cookieFor(admin.id));
    expect(asAdmin.body.map((i: { id: string }) => i.id)).toContain(id);
  });

  it("enforces access and manage boundaries", async () => {
    const { manager, candidate } = await scenario();
    const created = await createInterview(manager.id, {
      jobTitle: "Boundary", model: "claude-opus-5-5", candidateIds: [candidate.id],
    });
    const id = created.body.id;
    const other = await createUser({ role: "manager" });

    // Unrelated manager cannot even read → 404 (existence not leaked).
    const read = await request(app).get(`/api/interviews/${id}`).set("Cookie", cookieFor(other.id));
    expect(read.status).toBe(404);

    // Assigned candidate can read but cannot manage → 403.
    const candRead = await request(app).get(`/api/interviews/${id}`).set("Cookie", cookieFor(candidate.id));
    expect(candRead.status).toBe(200);
    const candPatch = await request(app).patch(`/api/interviews/${id}`)
      .set("Cookie", cookieFor(candidate.id)).send({ company: "Hax" });
    expect(candPatch.status).toBe(403);
  });

  it("runs the lifecycle and snapshots the resume on first start", async () => {
    const { manager, candidate, resume } = await scenario();
    const created = await createInterview(manager.id, {
      jobTitle: "Lifecycle", model: "claude-opus-5-5", resumeId: resume.id, candidateIds: [candidate.id],
    });
    const id = created.body.id;
    const cookie = cookieFor(manager.id);

    const start = await request(app).post(`/api/interviews/${id}/status`).set("Cookie", cookie).send({ status: "interviewing" });
    expect(start.status).toBe(200);
    expect(start.body.status).toBe("interviewing");
    expect(start.body.resume_copied_at).not.toBeNull();
    expect(start.body.resume_text).toBe("CONTENT");

    const end = await request(app).post(`/api/interviews/${id}/status`).set("Cookie", cookie).send({ status: "ended" });
    expect(end.status).toBe(200);
    expect(end.body.status).toBe("ended");

    const bad = await request(app).post(`/api/interviews/${id}/status`).set("Cookie", cookie).send({ status: "paused" });
    expect(bad.status).toBe(400);
  });

  it("clones a new version carrying candidates", async () => {
    const { manager, candidate } = await scenario();
    const created = await createInterview(manager.id, {
      jobTitle: "Versioned", model: "claude-opus-5-5", candidateIds: [candidate.id],
    });
    const res = await request(app).post(`/api/interviews/${created.body.id}/new-version`)
      .set("Cookie", cookieFor(manager.id)).send({ carrySummary: true });
    expect(res.status).toBe(201);
    expect(res.body.version).toBe(2);
    expect(res.body.parent_id).toBe(created.body.id);
    expect(res.body.carry_summary).toBe(true);
  });

  it("returns 402 for prep-pack when the owner has no API key", async () => {
    const { manager, candidate } = await scenario();
    const created = await createInterview(manager.id, {
      jobTitle: "NoKey", model: "claude-opus-5-5", candidateIds: [candidate.id],
    });
    const res = await request(app).post(`/api/interviews/${created.body.id}/prep-pack`).set("Cookie", cookieFor(manager.id));
    expect(res.status).toBe(402);
  });
});
