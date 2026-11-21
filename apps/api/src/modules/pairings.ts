import { Router } from "express";
import {
  CONTACT_VISIBLE_PAIRING_STATUSES,
  rebookSchema,
  reviewCreateSchema,
  type Pairing,
  type PairingStatus,
  type Rebooking,
} from "@team1/shared";
import { pool, withTransaction, type Db } from "../db/pool.ts";
import { currentUser, requireAuth, type AuthUser } from "../lib/auth.ts";
import { assertNotBlocked } from "../lib/blocks.ts";
import { idParam } from "../lib/http.ts";
import { checkEligibility, notEligible } from "../lib/eligibility.ts";
import { conflict, forbidden, notFound } from "../lib/errors.ts";
import { notify } from "../lib/events.ts";

const PAIRING_SELECT = `
  select p.*, j.title, j.tier, j.area, j.landmark, j.starts_at, j.ends_at, j.pay_type, j.pay_min, j.pay_max,
         j.payment_terms, j.workers_needed, c.name as category_name, c.slug as category_slug,
         wu.username as worker_username, wu.phone as worker_phone,
         eu.username as employer_username, eu.phone as employer_phone,
         a.proposed_pay, rb.id as rebooking_id, rb.status as rebooking_status
  from pairings p
  join jobs j on j.id = p.job_id
  join job_categories c on c.id = j.category_id
  join users wu on wu.id = p.worker_id
  join users eu on eu.id = p.employer_id
  left join applications a on a.id = p.application_id
  left join lateral (
    select id, status from rebookings where original_pairing_id = p.id order by created_at desc limit 1
  ) rb on true`;

type Row = Record<string, any>;
type ReviewRow = { pairing_id: string; reviewer_id: string; overall: number; body: string };

function toPairing(r: Row, viewerId: string, reviews: ReviewRow[]): Pairing {
  const myRole = r.worker_id === viewerId ? "worker" : "employer";
  const contactVisible = (CONTACT_VISIBLE_PAIRING_STATUSES as readonly string[]).includes(r.status);
  const mine = reviews.find((rv) => rv.pairing_id === r.id && rv.reviewer_id === viewerId);
  const theirs = reviews.find((rv) => rv.pairing_id === r.id && rv.reviewer_id !== viewerId);
  return {
    id: r.id,
    status: r.status,
    paymentStatus: r.payment_status,
    myRole,
    job: {
      id: r.job_id,
      title: r.title,
      tier: r.tier,
      area: r.area,
      landmark: r.landmark,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      payType: r.pay_type,
      payMin: r.pay_min,
      payMax: r.pay_max,
      paymentTerms: r.payment_terms,
      categoryName: r.category_name,
      categorySlug: r.category_slug,
    },
    worker: { id: r.worker_id, username: r.worker_username },
    employer: { id: r.employer_id, username: r.employer_username },
    agreedPay: r.proposed_pay ?? r.pay_max ?? r.pay_min ?? null,
    confirmedAt: r.confirmed_at,
    startedAt: r.started_at,
    employerCompletedAt: r.employer_completed_at,
    workerCompletedAt: r.worker_completed_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    contact: contactVisible ? { phone: myRole === "worker" ? r.employer_phone : r.worker_phone } : null,
    myReview: mine ? { overall: mine.overall, body: mine.body } : null,
    theirReview: theirs ? { overall: theirs.overall, body: theirs.body } : null,
    rebooking: r.rebooking_id ? { id: r.rebooking_id, status: r.rebooking_status } : null,
  };
}

async function reviewsFor(db: Db, pairingIds: string[]): Promise<ReviewRow[]> {
  if (!pairingIds.length) return [];
  const { rows } = await db.query(
    "select pairing_id, reviewer_id, overall, body from reviews where pairing_id = any($1::uuid[])",
    [pairingIds],
  );
  return rows;
}

async function loadPairing(db: Db, id: string, viewer: AuthUser, lock = false) {
  if (lock) await db.query("select 1 from pairings where id = $1 for update", [id]);
  const { rows } = await db.query(`${PAIRING_SELECT} where p.id = $1`, [id]);
  const p = rows[0];
  if (!p) throw notFound("Pairing not found");
  if (p.worker_id !== viewer.id && p.employer_id !== viewer.id && viewer.role !== "admin") {
    throw notFound("Pairing not found");
  }
  return p;
}

async function respond(res: import("express").Response, id: string, viewer: AuthUser) {
  const p = await loadPairing(pool, id, viewer);
  res.json({ pairing: toPairing(p, viewer.id, await reviewsFor(pool, [p.id])) });
}

function assertStatus(p: Row, allowed: PairingStatus[], action: string) {
  if (!allowed.includes(p.status)) {
    throw conflict(`Cannot ${action} a pairing that is ${p.status.replace("_", " ")}`, "pairing_wrong_status");
  }
}

function assertParty(p: Row, userId: string, role?: "worker" | "employer") {
  const isWorker = p.worker_id === userId;
  const isEmployer = p.employer_id === userId;
  if (role === "worker" && !isWorker) throw forbidden("Only the worker can do that");
  if (role === "employer" && !isEmployer) throw forbidden("Only the employer can do that");
  if (!isWorker && !isEmployer) throw forbidden();
}

const otherParty = (p: Row, userId: string): string => (p.worker_id === userId ? p.employer_id : p.worker_id);

async function fillJobIfFull(db: Db, jobId: string, workersNeeded: number, title: string) {
  const { rows } = await db.query(
    "select count(*)::int as n from pairings where job_id = $1 and status in ('confirmed', 'in_progress', 'completed')",
    [jobId],
  );
  if (rows[0].n < workersNeeded) return;
  await db.query("update jobs set status = 'filled', updated_at = now() where id = $1 and status = 'published'", [
    jobId,
  ]);
  const rejected = await db.query(
    `update applications set status = 'rejected', updated_at = now()
     where job_id = $1 and status = 'pending' returning worker_id`,
    [jobId],
  );
  for (const r of rejected.rows) await notify(db, r.worker_id, "not_selected", { jobId, title });
}

export const pairingsRouter = Router();

pairingsRouter.get("/me/pairings", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const role = req.query.role === "worker" ? "worker" : req.query.role === "employer" ? "employer" : null;
  const where = role ? `p.${role}_id = $1` : "(p.worker_id = $1 or p.employer_id = $1)";
  const { rows } = await pool.query(`${PAIRING_SELECT} where ${where} order by p.created_at desc`, [me.id]);
  const reviews = await reviewsFor(
    pool,
    rows.map((r) => r.id),
  );
  res.json({ pairings: rows.map((r) => toPairing(r, me.id, reviews)) });
});

pairingsRouter.get("/pairings/:id", requireAuth, async (req, res) => {
  await respond(res, idParam(req), currentUser(req));
});

pairingsRouter.post("/pairings/:id/accept", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id, "worker");
    assertStatus(p, ["pending_confirmation"], "accept");
    // Re-check: verification may have been revoked since the application was made.
    const jobRow = (await db.query("select tier, category_id from jobs where id = $1", [p.job_id])).rows[0];
    const eligibility = await checkEligibility(db, me.id, { tier: jobRow.tier, categoryId: jobRow.category_id });
    if (!eligibility.eligible) throw notEligible(eligibility);

    await db.query(
      "update pairings set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = $1",
      [p.id],
    );
    await fillJobIfFull(db, p.job_id, p.workers_needed, p.title);
    await notify(db, p.employer_id, "pairing_confirmed", { pairingId: p.id, title: p.title, worker: me.username });
  });
  await respond(res, idParam(req), me);
});

pairingsRouter.post("/pairings/:id/decline", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id, "worker");
    assertStatus(p, ["pending_confirmation"], "decline");
    await db.query("update pairings set status = 'declined', updated_at = now() where id = $1", [p.id]);
    if (p.application_id) {
      await db.query("update applications set status = 'withdrawn', updated_at = now() where id = $1", [
        p.application_id,
      ]);
    }
    await notify(db, p.employer_id, "pairing_declined", { pairingId: p.id, title: p.title, worker: me.username });
  });
  await respond(res, idParam(req), me);
});

pairingsRouter.post("/pairings/:id/start", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id);
    assertStatus(p, ["confirmed"], "start");
    await db.query("update pairings set status = 'in_progress', started_at = now(), updated_at = now() where id = $1", [
      p.id,
    ]);
    await notify(db, otherParty(p, me.id), "work_started", { pairingId: p.id, title: p.title });
  });
  await respond(res, idParam(req), me);
});

pairingsRouter.post("/pairings/:id/complete", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id);
    assertStatus(p, ["confirmed", "in_progress"], "complete");
    const column = p.worker_id === me.id ? "worker_completed_at" : "employer_completed_at";
    if (p[column]) {
      throw conflict("You already confirmed completion; waiting for the other side", "already_confirmed_completion");
    }
    const { rows } = await db.query(
      `update pairings set ${column} = now(), updated_at = now(),
         started_at = coalesce(started_at, now())
       where id = $1 returning worker_completed_at, employer_completed_at`,
      [p.id],
    );
    const bothDone = rows[0].worker_completed_at && rows[0].employer_completed_at;
    if (bothDone) {
      await db.query(
        "update pairings set status = 'completed', completed_at = now(), updated_at = now() where id = $1",
        [p.id],
      );
      for (const userId of [p.worker_id, p.employer_id]) {
        await notify(db, userId, "pairing_completed", { pairingId: p.id, title: p.title });
      }
    } else {
      await notify(db, otherParty(p, me.id), "completion_requested", { pairingId: p.id, title: p.title });
    }
  });
  await respond(res, idParam(req), me);
});

pairingsRouter.post("/pairings/:id/cancel", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id);
    assertStatus(p, ["pending_confirmation", "confirmed"], "cancel");
    await db.query(
      `update pairings set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, updated_at = now()
       where id = $1`,
      [p.id, me.id],
    );
    await db.query("update jobs set status = 'published', updated_at = now() where id = $1 and status = 'filled'", [
      p.job_id,
    ]);
    await notify(db, otherParty(p, me.id), "pairing_cancelled", { pairingId: p.id, title: p.title });
  });
  await respond(res, idParam(req), me);
});

pairingsRouter.post("/pairings/:id/reviews", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = reviewCreateSchema.parse(req.body);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id);
    if (p.status !== "completed") {
      throw conflict("Reviews open once both sides confirm the job is completed", "review_not_open");
    }
    const existing = await db.query("select 1 from reviews where pairing_id = $1 and reviewer_id = $2", [p.id, me.id]);
    if (existing.rowCount) throw conflict("You already reviewed this job", "already_reviewed");
    const reviewee = otherParty(p, me.id);
    await db.query(
      `insert into reviews (pairing_id, reviewer_id, reviewee_id, overall, reliability, communication, quality, body)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        p.id,
        me.id,
        reviewee,
        body.overall,
        body.reliability ?? null,
        body.communication ?? null,
        body.quality ?? null,
        body.body,
      ],
    );
    await notify(db, reviewee, "review_received", { pairingId: p.id, title: p.title, overall: body.overall });
  });
  await respond(res, idParam(req), me);
});

// --- Rebooking (SRS section 16) -------------------------------------------

pairingsRouter.post("/pairings/:id/rebook", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = rebookSchema.parse(req.body);
  const rebookingId = await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id, "employer");
    if (p.status !== "completed") throw conflict("Only completed jobs can be rebooked", "rebook_not_completed");
    if (p.rebooking_status === "pending") {
      throw conflict("A rebooking request is already waiting for the worker", "rebook_pending");
    }
    await assertNotBlocked(db, me.id, p.worker_id);

    const job = await db.query(
      `insert into jobs (employer_id, category_id, tier, invited_worker_id, title, description, area, landmark,
                         starts_at, ends_at, pay_type, pay_min, pay_max, negotiable, payment_terms, workers_needed,
                         status, published_at)
       select employer_id, category_id, tier, $2::uuid, title, coalesce($3::text, description), area, landmark,
              $4::timestamptz, $5::timestamptz, pay_type, coalesce($6::numeric, pay_min), coalesce($7::numeric, pay_max),
              false, payment_terms, 1,
              'published', now()
       from jobs where id = $1
       returning id`,
      [
        p.job_id,
        p.worker_id,
        body.description ?? null,
        body.startsAt ?? null,
        body.endsAt ?? null,
        body.payMin ?? null,
        body.payMax ?? null,
      ],
    );
    const rb = await db.query(
      "insert into rebookings (original_pairing_id, new_job_id, worker_id) values ($1, $2, $3) returning id",
      [p.id, job.rows[0].id, p.worker_id],
    );
    await notify(db, p.worker_id, "rebook_request", {
      rebookingId: rb.rows[0].id,
      title: p.title,
      employer: me.username,
    });
    return rb.rows[0].id as string;
  });
  res.status(201).json({ rebookingId });
});

pairingsRouter.get("/me/rebookings", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const { rows } = await pool.query(
    `select rb.*, j.title, j.area, j.starts_at, j.pay_type, j.pay_min, j.pay_max,
            wu.username as worker_username, eu.username as employer_username, j.employer_id
     from rebookings rb
     join jobs j on j.id = rb.new_job_id
     join users wu on wu.id = rb.worker_id
     join users eu on eu.id = j.employer_id
     where rb.worker_id = $1 or j.employer_id = $1
     order by rb.created_at desc`,
    [me.id],
  );
  const rebookings: Rebooking[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.created_at,
    originalPairingId: r.original_pairing_id,
    newPairingId: r.new_pairing_id,
    job: {
      id: r.new_job_id,
      title: r.title,
      area: r.area,
      startsAt: r.starts_at,
      payType: r.pay_type,
      payMin: r.pay_min,
      payMax: r.pay_max,
    },
    worker: { username: r.worker_username },
    employer: { username: r.employer_username },
    direction: r.worker_id === me.id ? "incoming" : "outgoing",
  }));
  res.json({ rebookings });
});

async function loadRebooking(db: Db, id: string, workerId: string) {
  const { rows } = await db.query(
    `select rb.*, j.employer_id, j.title, j.tier, j.category_id
     from rebookings rb join jobs j on j.id = rb.new_job_id
     where rb.id = $1 for update of rb`,
    [id],
  );
  const rb = rows[0];
  if (!rb) throw notFound("Rebooking not found");
  if (rb.worker_id !== workerId) throw forbidden("Only the invited worker can respond");
  if (rb.status !== "pending") throw conflict(`This request is already ${rb.status}`, "request_already_decided");
  return rb;
}

pairingsRouter.post("/rebookings/:id/accept", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const pairingId = await withTransaction(async (db) => {
    const rb = await loadRebooking(db, idParam(req), me.id);
    const eligibility = await checkEligibility(db, me.id, { tier: rb.tier, categoryId: rb.category_id });
    if (!eligibility.eligible) throw notEligible(eligibility);

    const pairing = await db.query(
      `insert into pairings (job_id, employer_id, worker_id, status, confirmed_at)
       values ($1, $2, $3, 'confirmed', now()) returning id`,
      [rb.new_job_id, rb.employer_id, me.id],
    );
    const id = pairing.rows[0].id as string;
    await db.query("update jobs set status = 'filled', updated_at = now() where id = $1", [rb.new_job_id]);
    await db.query("update rebookings set status = 'accepted', new_pairing_id = $2, updated_at = now() where id = $1", [
      rb.id,
      id,
    ]);
    await notify(db, rb.employer_id, "rebook_accepted", { pairingId: id, title: rb.title, worker: me.username });
    return id;
  });
  res.json({ pairingId });
});

pairingsRouter.post("/rebookings/:id/decline", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const rb = await loadRebooking(db, idParam(req), me.id);
    await db.query("update rebookings set status = 'declined', updated_at = now() where id = $1", [rb.id]);
    await db.query("update jobs set status = 'cancelled', updated_at = now() where id = $1", [rb.new_job_id]);
    await notify(db, rb.employer_id, "rebook_declined", { title: rb.title, worker: me.username });
  });
  res.json({ ok: true });
});
