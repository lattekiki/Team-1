import { Router } from "express";
import { applicationCreateSchema, type Applicant, type MyApplication } from "@team1/shared";
import { pool, withTransaction, type Db } from "../db/pool.ts";
import { currentUser, requireAuth } from "../lib/auth.ts";
import { idParam } from "../lib/http.ts";
import { checkEligibility } from "../lib/eligibility.ts";
import { AppError, conflict, forbidden, notFound } from "../lib/errors.ts";
import { notify } from "../lib/events.ts";
import { reputationFor } from "../lib/stats.ts";

const ACTIVE_PAIRING = "('pending_confirmation', 'confirmed', 'in_progress', 'completed')";

async function applicationWithJob(db: Db, applicationId: string, lock = false) {
  const { rows } = await db.query(
    `select a.*, j.employer_id, j.status as job_status, j.title as job_title, j.workers_needed
     from applications a join jobs j on j.id = a.job_id
     where a.id = $1 ${lock ? "for update of a, j" : ""}`,
    [applicationId],
  );
  if (!rows[0]) throw notFound("Application not found");
  return rows[0];
}

export const applicationsRouter = Router();

applicationsRouter.post("/jobs/:id/applications", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = applicationCreateSchema.parse(req.body);

  const application = await withTransaction(async (db) => {
    const { rows } = await db.query("select * from jobs where id = $1 for share", [idParam(req)]);
    const job = rows[0];
    if (!job || job.status === "draft") throw notFound("Job not found");
    if (job.status !== "published") throw conflict("This job is no longer accepting applications");
    if (job.invited_worker_id) throw conflict("This is a private rebooking request");
    if (job.employer_id === me.id) throw forbidden("You cannot apply to your own job");
    if (job.application_deadline && new Date(job.application_deadline) < new Date()) {
      throw conflict("The application deadline has passed");
    }
    if (body.proposedPay != null && !job.negotiable) throw conflict("This job does not accept pay proposals");

    const eligibility = await checkEligibility(db, me.id, { tier: job.tier, categoryId: job.category_id });
    if (!eligibility.eligible) throw new AppError(403, "not_eligible", eligibility.reason ?? "Not eligible");

    const existing = await db.query("select id, status from applications where job_id = $1 and worker_id = $2", [
      job.id,
      me.id,
    ]);
    let row;
    if (existing.rows[0]) {
      if (existing.rows[0].status !== "withdrawn") throw conflict("You already applied to this job");
      row = (
        await db.query(
          `update applications set status = 'pending', message = $2, proposed_pay = $3, updated_at = now()
           where id = $1 returning *`,
          [existing.rows[0].id, body.message, body.proposedPay ?? null],
        )
      ).rows[0];
    } else {
      row = (
        await db.query(
          "insert into applications (job_id, worker_id, message, proposed_pay) values ($1, $2, $3, $4) returning *",
          [job.id, me.id, body.message, body.proposedPay ?? null],
        )
      ).rows[0];
    }
    await notify(db, job.employer_id, "application_received", {
      jobId: job.id,
      title: job.title,
      worker: me.username,
    });
    return row;
  });

  res.status(201).json({ application: { id: application.id, status: application.status } });
});

async function listApplicants(where: string, param: string): Promise<Applicant[]> {
  const { rows } = await pool.query(
    `select a.id, a.status, a.message, a.proposed_pay, a.created_at,
            j.id as job_id, j.title as job_title, j.tier as job_tier, j.status as job_status,
            u.id as worker_id, u.username, u.identity_verified, u.high_trust_approved,
            w.experience_level, coalesce(w.area, '') as area,
            p.id as pairing_id,
            coalesce((select array_agg(s.name order by s.name) from user_skills us
                       join skills s on s.id = us.skill_id where us.user_id = u.id), '{}') as skills
     from applications a
     join jobs j on j.id = a.job_id
     join users u on u.id = a.worker_id
     left join worker_profiles w on w.user_id = u.id
     left join pairings p on p.application_id = a.id
     where ${where} and a.status <> 'withdrawn'
     order by a.created_at desc`,
    [param],
  );
  const rep = await reputationFor(
    pool,
    rows.map((r) => r.worker_id),
  );
  return rows.map((r) => {
    const rp = rep.get(r.worker_id);
    return {
      id: r.id,
      status: r.status,
      message: r.message,
      proposedPay: r.proposed_pay,
      createdAt: r.created_at,
      pairingId: r.pairing_id,
      worker: {
        id: r.worker_id,
        username: r.username,
        rating: rp?.rating ?? null,
        reviewCount: rp?.reviewCount ?? 0,
        completedJobs: rp?.completedJobs ?? 0,
        identityVerified: r.identity_verified,
        highTrustApproved: r.high_trust_approved,
        experienceLevel: r.experience_level,
        area: r.area,
        skills: r.skills,
      },
      job: { id: r.job_id, title: r.job_title, tier: r.job_tier, status: r.job_status },
    };
  });
}

applicationsRouter.get("/jobs/:id/applications", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const job = (await pool.query("select employer_id from jobs where id = $1", [idParam(req)])).rows[0];
  if (!job) throw notFound("Job not found");
  if (job.employer_id !== me.id && me.role !== "admin") throw forbidden();
  res.json({ applicants: await listApplicants("a.job_id = $1", idParam(req)) });
});

applicationsRouter.get("/me/applicants", requireAuth, async (req, res) => {
  const me = currentUser(req);
  res.json({ applicants: await listApplicants("j.employer_id = $1", me.id) });
});

applicationsRouter.get("/me/applications", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const { rows } = await pool.query(
    `select a.id, a.status, a.message, a.proposed_pay, a.created_at,
            j.id as job_id, j.title, j.tier, j.area, j.pay_type, j.pay_min, j.pay_max, j.status as job_status,
            u.username as employer_username, p.id as pairing_id, p.status as pairing_status
     from applications a
     join jobs j on j.id = a.job_id
     join users u on u.id = j.employer_id
     left join pairings p on p.application_id = a.id
     where a.worker_id = $1
     order by a.created_at desc`,
    [me.id],
  );
  const applications: MyApplication[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    message: r.message,
    proposedPay: r.proposed_pay,
    createdAt: r.created_at,
    job: {
      id: r.job_id,
      title: r.title,
      tier: r.tier,
      area: r.area,
      payType: r.pay_type,
      payMin: r.pay_min,
      payMax: r.pay_max,
      status: r.job_status,
      employerUsername: r.employer_username,
    },
    pairing: r.pairing_id ? { id: r.pairing_id, status: r.pairing_status } : null,
  }));
  res.json({ applications });
});

applicationsRouter.post("/applications/:id/withdraw", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const app = await applicationWithJob(pool, idParam(req));
  if (app.worker_id !== me.id) throw forbidden();
  if (app.status !== "pending") throw conflict("Only pending applications can be withdrawn");
  await pool.query("update applications set status = 'withdrawn', updated_at = now() where id = $1", [app.id]);
  res.json({ application: { id: app.id, status: "withdrawn" } });
});

applicationsRouter.post("/applications/:id/select", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const pairingId = await withTransaction(async (db) => {
    const app = await applicationWithJob(db, idParam(req), true);
    if (app.employer_id !== me.id) throw forbidden("Only the employer can select applicants");
    if (app.status !== "pending") throw conflict(`This application is ${app.status}`);
    if (app.job_status !== "published") throw conflict("This job is not open");

    const { rows } = await db.query(
      `select count(*)::int as n from pairings where job_id = $1 and status in ${ACTIVE_PAIRING}`,
      [app.job_id],
    );
    if (rows[0].n >= app.workers_needed) throw conflict("All positions for this job are already filled");

    await db.query("update applications set status = 'selected', updated_at = now() where id = $1", [app.id]);
    const pairing = await db.query(
      `insert into pairings (job_id, employer_id, worker_id, application_id)
       values ($1, $2, $3, $4) returning id`,
      [app.job_id, me.id, app.worker_id, app.id],
    );
    const id = pairing.rows[0].id as string;
    await notify(db, app.worker_id, "selected", { jobId: app.job_id, title: app.job_title, pairingId: id });
    return id;
  });
  res.json({ pairingId });
});

applicationsRouter.post("/applications/:id/reject", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const app = await applicationWithJob(db, idParam(req), true);
    if (app.employer_id !== me.id) throw forbidden();
    if (app.status !== "pending") throw conflict(`This application is ${app.status}`);
    await db.query("update applications set status = 'rejected', updated_at = now() where id = $1", [app.id]);
    await notify(db, app.worker_id, "not_selected", { jobId: app.job_id, title: app.job_title });
  });
  res.json({ application: { id: idParam(req), status: "rejected" } });
});
