import { Router } from "express";
import { z } from "zod";
import { applicationCreateSchema, type Applicant, type MyApplication } from "@team1/shared";
import { pool, withTransaction, type Db } from "../db/pool.ts";
import { currentUser, requireAuth } from "../lib/auth.ts";
import { idParam } from "../lib/http.ts";
import { assertNotBlocked, notBlockedSql } from "../lib/blocks.ts";
import { checkEligibility, notEligible } from "../lib/eligibility.ts";
import { conflict, forbidden, notFound } from "../lib/errors.ts";
import { notify } from "../lib/events.ts";
import { initialPaymentStatus, recordPaymentEvent } from "../lib/payments.ts";
import { narrateMatches } from "../lib/match-narrate.ts";
import { scoreApplicantForJob, templateMatchBlurb } from "../lib/matching.ts";
import { reputationFor } from "../lib/stats.ts";
import { assertVipCategoriesOpen } from "../lib/pilot.ts";
import { expireStaleJobs } from "./jobs.ts";

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
  await expireStaleJobs();

  const application = await withTransaction(async (db) => {
    const { rows } = await db.query("select * from jobs where id = $1 for share", [idParam(req)]);
    const job = rows[0];
    if (!job || job.status === "draft") throw notFound("Job not found");
    if (job.status !== "published") throw conflict("This job is no longer accepting applications", "job_closed");
    if (job.invited_worker_id) throw conflict("This is a private rebooking request", "private_job");
    if (job.employer_id === me.id) throw forbidden("You cannot apply to your own job", "own_job");
    assertVipCategoriesOpen(job.tier);
    await assertNotBlocked(db, me.id, job.employer_id);
    if (job.application_deadline && new Date(job.application_deadline) < new Date()) {
      throw conflict("The application deadline has passed", "deadline_passed");
    }
    if (body.proposedPay != null && !job.negotiable) {
      throw conflict("This job does not accept pay proposals", "no_pay_proposals");
    }
    const message =
      job.tier === "ordinary"
        ? body.message
        : z
            .object({
              message: z.string().trim().min(10, "Tell the employer a little about your experience").max(2000),
            })
            .parse({ message: body.message }).message;

    const eligibility = await checkEligibility(db, me.id, { tier: job.tier, categoryId: job.category_id });
    if (!eligibility.eligible) throw notEligible(eligibility);

    const existing = await db.query("select id, status from applications where job_id = $1 and worker_id = $2", [
      job.id,
      me.id,
    ]);
    let row;
    if (existing.rows[0]) {
      if (existing.rows[0].status !== "withdrawn") throw conflict("You already applied to this job", "already_applied");
      row = (
        await db.query(
          `update applications set status = 'pending', message = $2, proposed_pay = $3, updated_at = now()
           where id = $1 returning *`,
          [existing.rows[0].id, message, body.proposedPay ?? null],
        )
      ).rows[0];
    } else {
      row = (
        await db.query(
          "insert into applications (job_id, worker_id, message, proposed_pay) values ($1, $2, $3, $4) returning *",
          [job.id, me.id, message, body.proposedPay ?? null],
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

async function listApplicants(where: string, param: string, language: string): Promise<Applicant[]> {
  const { rows } = await pool.query(
    `select a.id, a.status, a.message, a.proposed_pay, a.created_at,
            j.id as job_id, j.title as job_title, j.tier as job_tier, j.status as job_status,
            j.workers_needed, j.category_id, j.area as job_area,
            (select count(*) from pairings p2
              where p2.job_id = j.id
                and p2.status in ('pending_confirmation', 'confirmed', 'in_progress', 'completed'))::int as filled_slots,
            u.id as worker_id, u.username, u.identity_verified, u.high_trust_approved,
            w.experience_level, coalesce(w.area, '') as area,
            p.id as pairing_id,
            coalesce((select json_agg(json_build_object('slug', s.slug, 'name', s.name) order by s.name)
                       from user_skills us join skills s on s.id = us.skill_id where us.user_id = u.id), '[]') as skills,
            coalesce((select array_agg(distinct s.category_id)
                       from user_skills us join skills s on s.id = us.skill_id where us.user_id = u.id), '{}') as skill_category_ids,
            (select count(*) from pairings p3 join jobs j3 on j3.id = p3.job_id
              where p3.worker_id = u.id and p3.status = 'completed' and j3.category_id = j.category_id)::int as completed_in_category
     from applications a
     join jobs j on j.id = a.job_id
     join users u on u.id = a.worker_id
     left join worker_profiles w on w.user_id = u.id
     left join pairings p on p.application_id = a.id
     where ${where} and a.status <> 'withdrawn' and ${notBlockedSql("j.employer_id", "a.worker_id")}
     order by a.created_at desc`,
    [param],
  );
  const rep = await reputationFor(
    pool,
    rows.map((r) => r.worker_id),
  );
  const mapped: Applicant[] = rows.map((r) => {
    const rp = rep.get(r.worker_id);
    const match = scoreApplicantForJob(
      { categoryId: r.category_id, area: r.job_area },
      {
        area: r.area,
        skillCategoryIds: r.skill_category_ids ?? [],
        completedInCategory: r.completed_in_category ?? 0,
      },
    );
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
      job: {
        id: r.job_id,
        title: r.job_title,
        tier: r.job_tier,
        status: r.job_status,
        workersNeeded: r.workers_needed,
        filledSlots: r.filled_slots ?? 0,
        categoryId: r.category_id,
      },
      match: {
        ...match,
        blurb: templateMatchBlurb({
          title: r.job_title,
          area: r.area,
          reasons: match.reasons,
          subject: "applicant",
        }),
      },
    };
  });
  const pending = mapped.filter((a) => a.status === "pending").sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
  const rest = mapped.filter((a) => a.status !== "pending");
  const narrated = await narrateMatches(
    pending.map((a) => ({
      id: a.id,
      title: a.job.title,
      area: a.worker.area,
      match: a.match!,
    })),
    { language, subject: "applicant" },
  );
  const byId = new Map(narrated.map((n) => [n.id, n.match]));
  const pendingOut = pending.map((a) => ({ ...a, match: byId.get(a.id) ?? a.match }));
  const order = narrated.map((n) => n.id);
  pendingOut.sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return [...pendingOut, ...rest];
}

applicationsRouter.get("/jobs/:id/applications", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const job = (await pool.query("select employer_id from jobs where id = $1", [idParam(req)])).rows[0];
  if (!job) throw notFound("Job not found");
  if (job.employer_id !== me.id && me.role !== "admin") throw forbidden();
  res.json({ applicants: await listApplicants("a.job_id = $1", idParam(req), me.language) });
});

applicationsRouter.get("/me/applicants", requireAuth, async (req, res) => {
  const me = currentUser(req);
  res.json({ applicants: await listApplicants("j.employer_id = $1", me.id, me.language) });
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
  if (app.status !== "pending") throw conflict("Only pending applications can be withdrawn", "application_not_pending");
  await pool.query("update applications set status = 'withdrawn', updated_at = now() where id = $1", [app.id]);
  res.json({ application: { id: app.id, status: "withdrawn" } });
});

applicationsRouter.post("/applications/:id/select", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const pairingId = await withTransaction(async (db) => {
    const app = await applicationWithJob(db, idParam(req), true);
    if (app.employer_id !== me.id) throw forbidden("Only the employer can select applicants");
    if (app.status !== "pending") throw conflict(`This application is ${app.status}`, "application_not_pending");
    if (app.job_status !== "published") throw conflict("This job is not open", "job_closed");
    await assertNotBlocked(db, me.id, app.worker_id);

    const { rows } = await db.query(
      `select count(*)::int as n from pairings where job_id = $1 and status in ${ACTIVE_PAIRING}`,
      [app.job_id],
    );
    if (rows[0].n >= app.workers_needed) {
      throw conflict("All positions for this job are already filled", "positions_filled");
    }

    await db.query("update applications set status = 'selected', updated_at = now() where id = $1", [app.id]);
    const payStatus = initialPaymentStatus();
    const pairing = await db.query(
      `insert into pairings (job_id, employer_id, worker_id, application_id, payment_status)
       values ($1, $2, $3, $4, $5) returning id`,
      [app.job_id, me.id, app.worker_id, app.id, payStatus],
    );
    const id = pairing.rows[0].id as string;
    if (payStatus !== "not_required") {
      await recordPaymentEvent(db, { pairingId: id, action: "create", amountEtb: null, actorId: me.id });
    }
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
    if (app.status !== "pending") throw conflict(`This application is ${app.status}`, "application_not_pending");
    await db.query("update applications set status = 'rejected', updated_at = now() where id = $1", [app.id]);
    await notify(db, app.worker_id, "not_selected", { jobId: app.job_id, title: app.job_title });
  });
  res.json({ application: { id: idParam(req), status: "rejected" } });
});
