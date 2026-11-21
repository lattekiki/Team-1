import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { pool } from "../src/db/pool.ts";

const app = createApp();
type Agent = ReturnType<typeof request.agent>;
let phoneSeq = 0;

async function signUp(username: string) {
  const phone = `+2519120000${String(++phoneSeq).padStart(2, "0")}`;
  const agent = request.agent(app);
  const otp = await agent.post("/api/auth/otp/request").send({ phone }).expect(200);
  expect(otp.body.isNewUser).toBe(true);
  const code = otp.body.devCode as string;
  await agent.post("/api/auth/otp/verify").send({ phone, code }).expect(422);
  const res = await agent.post("/api/auth/otp/verify").send({ phone, code, username }).expect(200);
  return { agent, phone, id: res.body.user.id as string, username };
}

async function categoryId(slug: string) {
  const res = await request(app).get("/api/categories").expect(200);
  return res.body.categories.find((c: { slug: string }) => c.slug === slug).id as number;
}

async function postJob(agent: Agent, slug: string, title: string) {
  const res = await agent
    .post("/api/jobs")
    .send({
      categoryId: await categoryId(slug),
      title,
      description: "Clear task description",
      area: "Merkato",
      payType: "daily",
      payMin: 600,
      payMax: 650,
      publish: true,
    })
    .expect(201);
  return res.body.job.id as string;
}

afterAll(async () => {
  await pool.end();
});

describe("Definition of Done journey (SRS section 35)", () => {
  let worker: Awaited<ReturnType<typeof signUp>>;
  let employer: Awaited<ReturnType<typeof signUp>>;
  let admin: Awaited<ReturnType<typeof signUp>>;
  let jobId: string;
  let applicationId: string;
  let pairingId: string;

  beforeAll(async () => {
    worker = await signUp("abebe");
    employer = await signUp("merkato_shop");
    admin = await signUp("safety_admin");
    await pool.query("update users set role = 'admin' where id = $1", [admin.id]);
  });

  it("lets one account set up worker and employer profiles", async () => {
    await worker.agent
      .put("/api/me/worker-profile")
      .send({ bio: "JU student", area: "Kochi", availability: "Weekends" })
      .expect(200);
    await employer.agent.patch("/api/me").send({ activeMode: "employer" }).expect(200);
    await employer.agent.put("/api/me/employer-profile").send({ employerType: "business", area: "Merkato" }).expect(200);
    const me = await employer.agent.get("/api/auth/me").expect(200);
    expect(me.body.user.activeMode).toBe("employer");
  });

  it("employer posts a job and worker discovers and applies", async () => {
    jobId = await postJob(employer.agent, "shop-help", "Weekend shop assistant");
    const list = await worker.agent.get("/api/jobs").query({ area: "Merkato" }).expect(200);
    const job = list.body.jobs.find((j: { id: string }) => j.id === jobId);
    expect(job.eligibility).toEqual({ eligible: true });
    expect(JSON.stringify(list.body)).not.toContain(employer.phone);

    const res = await worker.agent
      .post(`/api/jobs/${jobId}/applications`)
      .send({ message: "I live near Merkato and work weekends." })
      .expect(201);
    applicationId = res.body.application.id;
    await worker.agent.post(`/api/jobs/${jobId}/applications`).send({ message: "Applying twice here" }).expect(409);
  });

  it("employer reviews applicants without seeing contact details, then selects", async () => {
    const res = await employer.agent.get(`/api/jobs/${jobId}/applications`).expect(200);
    expect(res.body.applicants).toHaveLength(1);
    expect(res.body.applicants[0].worker.username).toBe("abebe");
    expect(JSON.stringify(res.body)).not.toContain(worker.phone);
    await worker.agent.get(`/api/jobs/${jobId}/applications`).expect(403);

    const sel = await employer.agent.post(`/api/applications/${applicationId}/select`).expect(200);
    pairingId = sel.body.pairingId;
  });

  it("keeps contact hidden until the worker confirms the pairing", async () => {
    const before = await worker.agent.get(`/api/pairings/${pairingId}`).expect(200);
    expect(before.body.pairing.status).toBe("pending_confirmation");
    expect(before.body.pairing.contact).toBeNull();

    const accepted = await worker.agent.post(`/api/pairings/${pairingId}/accept`).expect(200);
    expect(accepted.body.pairing.status).toBe("confirmed");
    expect(accepted.body.pairing.contact).toEqual({ phone: employer.phone });

    const employerView = await employer.agent.get(`/api/pairings/${pairingId}`).expect(200);
    expect(employerView.body.pairing.contact).toEqual({ phone: worker.phone });

    const job = await worker.agent.get(`/api/jobs/${jobId}`).expect(200);
    expect(job.body.job.status).toBe("filled");
  });

  it("sends status notifications to both sides", async () => {
    const w = await worker.agent.get("/api/notifications").expect(200);
    expect(w.body.notifications.map((n: { type: string }) => n.type)).toContain("selected");
    const e = await employer.agent.get("/api/notifications").expect(200);
    const types = e.body.notifications.map((n: { type: string }) => n.type);
    expect(types).toEqual(expect.arrayContaining(["application_received", "pairing_confirmed"]));
  });

  it("requires both sides to confirm completion before reviews", async () => {
    await worker.agent.post(`/api/pairings/${pairingId}/reviews`).send({ overall: 5 }).expect(409);
    const half = await employer.agent.post(`/api/pairings/${pairingId}/complete`).expect(200);
    expect(half.body.pairing.status).toBe("confirmed");
    const done = await worker.agent.post(`/api/pairings/${pairingId}/complete`).expect(200);
    expect(done.body.pairing.status).toBe("completed");
  });

  it("allows exactly one review per side", async () => {
    await employer.agent
      .post(`/api/pairings/${pairingId}/reviews`)
      .send({ overall: 5, reliability: 5, body: "On time and careful" })
      .expect(200);
    await worker.agent.post(`/api/pairings/${pairingId}/reviews`).send({ overall: 4 }).expect(200);
    await worker.agent.post(`/api/pairings/${pairingId}/reviews`).send({ overall: 1 }).expect(409);

    const profile = await request(app).get("/api/users/abebe").expect(200);
    expect(profile.body.profile.rating).toBe(5);
    expect(profile.body.profile.completedJobs).toBe(1);
  });

  it("lets the employer rebook and the worker accept", async () => {
    const rb = await employer.agent.post(`/api/pairings/${pairingId}/rebook`).send({ payMax: 700 }).expect(201);
    await employer.agent.post(`/api/pairings/${pairingId}/rebook`).send({}).expect(409);
    const incoming = await worker.agent.get("/api/me/rebookings").expect(200);
    expect(incoming.body.rebookings[0]).toMatchObject({ id: rb.body.rebookingId, direction: "incoming" });

    const publicList = await request(app).get("/api/jobs").expect(200);
    expect(publicList.body.jobs.map((j: { id: string }) => j.id)).not.toContain(incoming.body.rebookings[0].job.id);

    const acc = await worker.agent.post(`/api/rebookings/${rb.body.rebookingId}/accept`).expect(200);
    const p = await employer.agent.get(`/api/pairings/${acc.body.pairingId}`).expect(200);
    expect(p.body.pairing.status).toBe("confirmed");
  });

  it("lets users report and admins review reports", async () => {
    await worker.agent
      .post("/api/reports")
      .send({ targetType: "user", targetId: employer.id, reason: "Test report for moderation" })
      .expect(201);
    await worker.agent.get("/api/admin/reports").expect(403);
    const reports = await admin.agent.get("/api/admin/reports").expect(200);
    const report = reports.body.reports[0];
    expect(report.reporter).toBe("abebe");
    await admin.agent.post(`/api/admin/reports/${report.id}/resolve`).send({ status: "resolved" }).expect(200);
    const auditLog = await admin.agent.get("/api/admin/audit").expect(200);
    expect(auditLog.body.entries[0].action).toBe("report.update");
  });

  it("blocks unauthorized access to private data and admin functions", async () => {
    const stranger = await signUp("stranger");
    await stranger.agent.get(`/api/pairings/${pairingId}`).expect(404);
    await stranger.agent.get(`/api/jobs/${jobId}/applications`).expect(403);
    await stranger.agent.post("/api/admin/verification/00000000-0000-0000-0000-000000000000/approve").expect(403);
    await request(app).get("/api/me/pairings").expect(401);
    await request(app).get("/api/pairings/not-a-uuid").expect(401);
  });
});

describe("hard rules", () => {
  it("gates VIP jobs on identity verification plus high-trust approval, in that order", async () => {
    const employer = await signUp("vip_family");
    const worker = await signUp("vip_worker");
    const admin = await signUp("vip_admin");
    await pool.query("update users set role = 'admin' where id = $1", [admin.id]);
    const vipJob = await postJob(employer.agent, "childcare", "After-school care");

    const list = await worker.agent.get("/api/jobs").query({ eligibleOnly: "1" }).expect(200);
    expect(list.body.jobs.map((j: { id: string }) => j.id)).not.toContain(vipJob);
    const apply = () =>
      worker.agent.post(`/api/jobs/${vipJob}/applications`).send({ message: "Experienced with children." });
    expect((await apply().expect(403)).body.error.code).toBe("not_eligible");

    const identity = await worker.agent
      .post("/api/verification")
      .send({ kind: "identity", note: "Fayda ID available" })
      .expect(201);
    const highTrust = await worker.agent
      .post("/api/verification")
      .send({ kind: "high_trust", note: "Two family references" })
      .expect(201);

    await admin.agent.post(`/api/admin/verification/${highTrust.body.record.id}/approve`).send({}).expect(409);
    await admin.agent.post(`/api/admin/verification/${identity.body.record.id}/approve`).send({}).expect(200);
    await apply().expect(403);
    await admin.agent.post(`/api/admin/verification/${highTrust.body.record.id}/approve`).send({}).expect(200);
    await apply().expect(201);
  });

  it("requires a matching skill for skilled jobs", async () => {
    const employer = await signUp("leaky_bakery");
    const worker = await signUp("handy_worker");
    const job = await postJob(employer.agent, "plumbing", "Fix sink leak");
    const apply = () =>
      worker.agent.post(`/api/jobs/${job}/applications`).send({ message: "I fix pipes and taps." });
    await apply().expect(403);

    const skills = await request(app).get("/api/skills").expect(200);
    const plumbing = skills.body.skills.find((s: { slug: string }) => s.slug === "plumbing");
    await worker.agent.put("/api/me/worker-profile").send({ skillIds: [plumbing.id] }).expect(200);
    await apply().expect(201);
  });

  it("filters jobs by Jimma-local date and minimum pay", async () => {
    const employer = await signUp("date_filter_shop");
    const errands = await categoryId("errands");
    // Noon on a Jimma (UTC+3) calendar day, `daysAhead` days from today there.
    const jimmaNoon = (daysAhead: number) => {
      const day = new Date(Date.now() + 3 * 3600_000);
      day.setUTCDate(day.getUTCDate() + daysAhead);
      return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 9)).toISOString();
    };
    const post = async (title: string, daysAhead: number, payMin: number) => {
      const res = await employer.agent
        .post("/api/jobs")
        .send({ categoryId: errands, title, area: "Ginjo", payType: "fixed", payMin, startsAt: jimmaNoon(daysAhead), publish: true })
        .expect(201);
      return res.body.job.id as string;
    };
    const tomorrow = await post("Datefilter tomorrow errand", 1, 300);
    const later = await post("Datefilter later errand", 10, 900);
    const ids = async (query: Record<string, string>) =>
      (await request(app).get("/api/jobs").query({ q: "Datefilter", ...query }).expect(200)).body.jobs.map(
        (j: { id: string }) => j.id,
      );

    expect(await ids({ when: "today" })).toEqual([]);
    expect(await ids({ when: "tomorrow" })).toEqual([tomorrow]);
    expect(await ids({ when: "week" })).toEqual([tomorrow]);
    expect(await ids({ minPay: "500" })).toEqual([later]);
    await request(app).get("/api/jobs").query({ when: "someday" }).expect(400);
  });

  it("blocking hides each side from the other and stops new applications", async () => {
    const employer = await signUp("blocking_shop");
    const worker = await signUp("blocked_worker");
    const other = await signUp("bystander");
    const job = await postJob(employer.agent, "errands", "Blockfilter errand");
    const second = await postJob(employer.agent, "errands", "Blockfilter second");
    const visibleTo = async (agent: Agent) =>
      (await agent.get("/api/jobs").query({ q: "Blockfilter" }).expect(200)).body.jobs.length;

    await worker.agent.post(`/api/jobs/${job}/applications`).send({ message: "I would like this job." }).expect(201);
    expect((await employer.agent.get(`/api/jobs/${job}/applications`).expect(200)).body.applicants).toHaveLength(1);

    await employer.agent.post("/api/users/nobody_here/block").expect(404);
    await employer.agent.post(`/api/users/${employer.username}/block`).expect(400);
    await employer.agent.post(`/api/users/${worker.username}/block`).expect(204);
    await employer.agent.post(`/api/users/${worker.username}/block`).expect(204); // idempotent

    expect((await employer.agent.get("/api/me/blocks").expect(200)).body.blocks.map((b: { username: string }) => b.username)).toEqual([
      worker.username,
    ]);
    expect((await request(app).get(`/api/users/${worker.username}`).expect(200)).body.profile.blockedByMe).toBe(false);
    expect((await employer.agent.get(`/api/users/${worker.username}`).expect(200)).body.profile.blockedByMe).toBe(true);

    // Their open application is closed, and they no longer see or can apply to the employer's jobs.
    expect((await employer.agent.get(`/api/jobs/${job}/applications`).expect(200)).body.applicants).toHaveLength(0);
    expect(await visibleTo(worker.agent)).toBe(0);
    expect(await visibleTo(other.agent)).toBe(2);
    const apply = await worker.agent.post(`/api/jobs/${second}/applications`).send({ message: "Trying again anyway." });
    expect(apply.status).toBe(403);
    expect(apply.body.error.code).toBe("blocked");

    // Blocking works both ways: the blocked worker blocking back changes nothing, and unblocking restores access.
    await employer.agent.delete(`/api/users/${worker.username}/block`).expect(204);
    expect(await visibleTo(worker.agent)).toBe(2);
    await worker.agent.post(`/api/users/${employer.username}/block`).expect(204);
    expect(await visibleTo(worker.agent)).toBe(0);
    expect(await visibleTo(employer.agent)).toBe(2); // the owner still sees their own jobs
    await worker.agent.post(`/api/jobs/${second}/applications`).send({ message: "Trying again anyway." }).expect(403);
    await worker.agent.post("/api/users/someone/block").expect(404);
  });

  it("does not let employers apply to their own jobs", async () => {
    const employer = await signUp("self_applier");
    const job = await postJob(employer.agent, "errands", "Deliver documents");
    await employer.agent.post(`/api/jobs/${job}/applications`).send({ message: "Applying to myself" }).expect(403);
  });

  it("locks a code after five wrong attempts", async () => {
    const phone = "+251913000001";
    const agent = request.agent(app);
    const otp = await agent.post("/api/auth/otp/request").send({ phone }).expect(200);
    const wrong = otp.body.devCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await agent.post("/api/auth/otp/verify").send({ phone, code: wrong, username: "locked_out" }).expect(400);
    }
    await agent
      .post("/api/auth/otp/verify")
      .send({ phone, code: otp.body.devCode, username: "locked_out" })
      .expect(400);
  });
});
