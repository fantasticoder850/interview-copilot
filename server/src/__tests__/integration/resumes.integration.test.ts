import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { cookieFor, createResume, createUser } from "./helpers/factories.js";
import { prepareTestDatabase, resetDb } from "./helpers/test-db.js";

const app = createApp();
const ok = await prepareTestDatabase();
const d = ok ? describe : describe.skip;

d("resumes", () => {
  beforeEach(resetDb);

  it("forbids candidates from the resumes area entirely", async () => {
    const candidate = await createUser({ role: "candidate" });
    const res = await request(app).get("/api/resumes").set("Cookie", cookieFor(candidate.id));
    expect(res.status).toBe(403);
  });

  it("lets a manager create and read their own resume", async () => {
    const manager = await createUser({ role: "manager" });
    const create = await request(app).post("/api/resumes").set("Cookie", cookieFor(manager.id))
      .send({ name: "My CV", role: "Engineer", content: "..." });
    expect(create.status).toBe(201);

    const read = await request(app).get(`/api/resumes/${create.body.id}`).set("Cookie", cookieFor(manager.id));
    expect(read.status).toBe(200);
    expect(read.body.name).toBe("My CV");
    expect(read.body).toHaveProperty("qa");
  });

  it("returns 404 when a manager reads another manager's resume", async () => {
    const owner = await createUser({ role: "manager" });
    const other = await createUser({ role: "manager" });
    const resume = await createResume(owner.id);
    const res = await request(app).get(`/api/resumes/${resume.id}`).set("Cookie", cookieFor(other.id));
    expect(res.status).toBe(404);
  });

  it("manages prepared Q&A under a resume", async () => {
    const manager = await createUser({ role: "manager" });
    const resume = await createResume(manager.id);
    const cookie = cookieFor(manager.id);

    const add = await request(app).post(`/api/resumes/${resume.id}/qa`).set("Cookie", cookie)
      .send({ question: "Salary?", answer: "Market rate" });
    expect(add.status).toBe(201);

    const list = await request(app).get(`/api/resumes/${resume.id}/qa`).set("Cookie", cookie);
    expect(list.body).toHaveLength(1);

    const del = await request(app).delete(`/api/resumes/${resume.id}/qa/${add.body.id}`).set("Cookie", cookie);
    expect(del.status).toBe(204);
  });

  it("allows an admin to read any resume", async () => {
    const owner = await createUser({ role: "manager" });
    const admin = await createUser({ role: "admin" });
    const resume = await createResume(owner.id);
    const res = await request(app).get(`/api/resumes/${resume.id}`).set("Cookie", cookieFor(admin.id));
    expect(res.status).toBe(200);
  });
});
