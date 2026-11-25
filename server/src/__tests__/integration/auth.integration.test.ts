import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { cookieFor, createUser } from "./helpers/factories.js";
import { prepareTestDatabase, resetDb } from "./helpers/test-db.js";

const app = createApp();
const ok = await prepareTestDatabase();
const d = ok ? describe : describe.skip;

d("auth flow", () => {
  beforeEach(resetDb);

  it("registers a pending, non-admin account", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Jane", email: "jane@example.com", password: "password123", requestedRole: "candidate",
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it("rejects duplicate email registration", async () => {
    await createUser({ role: "candidate", email: "dupe@example.com" });
    const res = await request(app).post("/api/auth/register").send({
      name: "Dup", email: "dupe@example.com", password: "password123", requestedRole: "candidate",
    });
    expect(res.status).toBe(409);
  });

  it("blocks login for a pending account and allows an approved one", async () => {
    await createUser({ role: "manager", email: "pend@example.com", status: "pending", password: "password123" });
    const pending = await request(app).post("/api/auth/login").send({ email: "pend@example.com", password: "password123" });
    expect(pending.status).toBe(403);

    await createUser({ role: "manager", email: "live@example.com", status: "approved", password: "password123" });
    const good = await request(app).post("/api/auth/login").send({ email: "live@example.com", password: "password123" });
    expect(good.status).toBe(200);
    expect(good.body.user.email).toBe("live@example.com");
    expect(good.headers["set-cookie"]?.[0]).toContain("ia_session=");
  });

  it("rejects a wrong password with 401", async () => {
    await createUser({ role: "manager", email: "pw@example.com", password: "password123" });
    const res = await request(app).post("/api/auth/login").send({ email: "pw@example.com", password: "nope" });
    expect(res.status).toBe(401);
  });

  it("requires authentication for /me and never leaks the password hash", async () => {
    const anon = await request(app).get("/api/auth/me");
    expect(anon.status).toBe(401);

    const user = await createUser({ role: "admin" });
    const res = await request(app).get("/api/auth/me").set("Cookie", cookieFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user).not.toHaveProperty("password_hash");
  });

  it("reports api-key status without exposing the key", async () => {
    const user = await createUser({ role: "manager" });
    const res = await request(app).get("/api/auth/api-key").set("Cookie", cookieFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasKey: false, last4: null });
  });

  it("rejects an API key that is not an Anthropic key", async () => {
    const user = await createUser({ role: "manager" });
    const res = await request(app).put("/api/auth/api-key").set("Cookie", cookieFor(user.id)).send({ apiKey: "not-a-key" });
    expect(res.status).toBe(400);
  });
});
