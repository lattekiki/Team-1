import { Router } from "express";
import {
  CONTACT_VISIBLE_PAIRING_STATUSES,
  quotePayment,
  disputeCreateSchema,
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
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.ts";
import { notify } from "../lib/events.ts";
import { env } from "../env.ts";
import { primaryWebOrigin } from "../lib/cors.ts";
import { markPairingHeld } from "../lib/payment-hold.ts";
import {
  initialPaymentStatus,
  paymentProvider,
  paymentsEnabled,
  platformHoldsFunds,
  recordPaymentEvent,
  type PaymentStatus,
} from "../lib/payments.ts";

const PAIRING_SELECT = `
  select p.*, j.title, j.tier, j.area, j.landmark, j.starts_at, j.ends_at, j.pay_type, j.pay_min, j.pay_max,
         j.payment_terms, j.workers_needed, c.name as category_name, c.slug as category_slug,
         wu.username as worker_username, wu.phone as worker_phone, wu.contact_name as worker_contact_name,
         eu.username as employer_username, eu.phone as employer_phone, eu.contact_name as employer_contact_name,
         a.proposed_pay, rb.id as rebooking_id, rb.status as rebooking_status,
         d.id as dispute_id, d.reason as dispute_reason, d.status as dispute_status,
         d.opened_by as dispute_opened_by, d.created_at as dispute_opened_at,
         d.resolution_note as dispute_resolution_note
  from pairings p
  join jobs j on j.id = p.job_id
  join job_categories c on c.id = j.category_id
  join users wu on wu.id = p.worker_id
  join users eu on eu.id = p.employer_id
  left join applications a on a.id = p.application_id
  left join lateral (
    select id, status from rebookings where original_pairing_id = p.id order by created_at desc limit 1
  ) rb on true
  left join lateral (
    select id, reason, status, opened_by, created_at, resolution_note
    from disputes where pairing_id = p.id order by created_at desc limit 1
  ) d on true`;

type Row = Record<string, any>;
type ReviewRow = { pairing_id: string; reviewer_id: string; overall: number; body: string };

function sharedContactName(contactName: string | null | undefined, username: string): string {
  const name = (contactName ?? "").trim();
  return name || username;
}

function toPairing(r: Row, viewerId: string, reviews: ReviewRow[]): Pairing {
  const myRole = r.worker_id === viewerId ? "worker" : "employer";
  const statusShowsContact = (CONTACT_VISIBLE_PAIRING_STATUSES as readonly string[]).includes(r.status);
  const fundsReady = !platformHoldsFunds || r.payment_status === "held" || r.payment_status === "paid";
  const contactVisible = statusShowsContact && fundsReady;
  const mine = reviews.find((rv) => rv.pairing_id === r.id && rv.reviewer_id === viewerId);
  const theirs = reviews.find((rv) => rv.pairing_id === r.id && rv.reviewer_id !== viewerId);
  return {
    id: r.id,
    status: r.status,
    paymentStatus: r.payment_status,
    paymentAmountEtb: r.payment_amount_etb != null ? Number(r.payment_amount_etb) : null,
    platformFeeEtb: r.platform_fee_etb != null ? Number(r.platform_fee_etb) : null,
    workerPayoutEtb: r.worker_payout_etb != null ? Number(r.worker_payout_etb) : null,
    paymentHeldAt: r.payment_held_at ?? null,
    paymentPaidAt: r.payment_paid_at ?? null,
    paymentCheckoutUrl: r.payment_checkout_url ?? null,
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
    employerAskedAt: r.employer_asked_at ?? null,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    contact: contactVisible
      ? {
          phone: myRole === "worker" ? r.employer_phone : r.worker_phone,
          name: sharedContactName(
            myRole === "worker" ? r.employer_contact_name : r.worker_contact_name,
            myRole === "worker" ? r.employer_username : r.worker_username,
          ),
        }
      : null,
    myReview: mine ? { overall: mine.overall, body: mine.body } : null,
    theirReview: theirs ? { overall: theirs.overall, body: theirs.body } : null,
    rebooking: r.rebooking_id ? { id: r.rebooking_id, status: r.rebooking_status } : null,
    dispute: r.dispute_id
      ? {
          id: r.dispute_id,
          reason: r.dispute_reason,
          status: r.dispute_status,
          openedByMe: r.dispute_opened_by === viewerId,
          openedAt: r.dispute_opened_at,
          resolutionNote: r.dispute_resolution_note,
        }
      : null,
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
    if (p.payment_status === "held") {
      const amount = Number(p.payment_amount_etb ?? p.proposed_pay ?? p.pay_max ?? p.pay_min ?? 0);
      await paymentProvider.refund({ pairingId: p.id, amountEtb: amount, externalId: p.payment_external_id });
      await db.query(
        `update pairings set payment_status = 'refunded', payment_refunded_at = now(), updated_at = now() where id = $1`,
        [p.id],
      );
      await recordPaymentEvent(db, {
        pairingId: p.id,
        action: "refund",
        amountEtb: amount,
        externalId: p.payment_external_id,
        actorId: me.id,
        note: "Refunded because the worker declined",
      });
      await notify(db, p.employer_id, "payment_refunded", { pairingId: p.id, title: p.title });
    }
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
    if (platformHoldsFunds && p.payment_status !== "held" && p.payment_status !== "paid") {
      throw conflict("Pay HojiiGO before work starts", "payment_required");
    }
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
    if (platformHoldsFunds && p.payment_status !== "held" && p.payment_status !== "paid") {
      throw conflict("Pay HojiiGO before confirming the work is done", "payment_required");
    }
    const isWorker = p.worker_id === me.id;
    if (platformHoldsFunds && !isWorker) {
      if (!p.worker_completed_at) {
        throw conflict("The worker reports the job first", "worker_not_finished");
      }
      if (!p.employer_asked_at) {
        throw conflict("An admin will ask you to confirm the job is done", "employer_not_asked");
      }
    }
    const column = isWorker ? "worker_completed_at" : "employer_completed_at";
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
      if (platformHoldsFunds) {
        const staff = await db.query("select id from users where role in ('admin', 'support')");
        for (const row of staff.rows) {
          await notify(db, row.id, "employer_confirmed_work", {
            pairingId: p.id,
            title: p.title,
            employer: p.employer_username,
          });
        }
      }
    } else if (platformHoldsFunds && isWorker) {
      await notify(db, p.employer_id, "worker_reported_done", {
        pairingId: p.id,
        title: p.title,
        worker: p.worker_username,
      });
      const staff = await db.query("select id from users where role in ('admin', 'support')");
      for (const row of staff.rows) {
        await notify(db, row.id, "worker_finished", {
          pairingId: p.id,
          title: p.title,
          worker: p.worker_username,
        });
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
    if (p.payment_status === "held") {
      const amount = Number(p.payment_amount_etb ?? p.proposed_pay ?? p.pay_max ?? p.pay_min ?? 0);
      await paymentProvider.refund({ pairingId: p.id, amountEtb: amount, externalId: p.payment_external_id });
      await db.query(
        `update pairings set payment_status = 'refunded', payment_refunded_at = now(), updated_at = now()
         where id = $1`,
        [p.id],
      );
      await recordPaymentEvent(db, {
        pairingId: p.id,
        action: "refund",
        amountEtb: amount,
        externalId: p.payment_external_id,
        actorId: me.id,
        note: "Refunded on pairing cancel",
      });
      await notify(db, otherParty(p, me.id), "payment_refunded", { pairingId: p.id, title: p.title });
    }
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

function assertPaymentsOn() {
  if (!paymentsEnabled) throw badRequest("Platform payments are disabled", "payments_disabled");
}

function jobPay(p: Row): number {
  const n = Number(p.proposed_pay ?? p.pay_max ?? p.pay_min ?? 0);
  if (!(n > 0)) throw badRequest("Agree a pay amount before recording payment", "payment_amount_required");
  return n;
}

function payoutAmount(p: Row): number {
  const stored = Number(p.worker_payout_etb ?? 0);
  if (stored > 0) return stored;
  return quotePayment(jobPay(p)).workerReceivesEtb;
}

pairingsRouter.post("/pairings/:id/payment/hold", requireAuth, async (req, res) => {
  assertPaymentsOn();
  const me = currentUser(req);
  let checkoutUrl: string | null = null;
  const pairingId = idParam(req);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, pairingId, me, true);
    assertParty(p, me.id, "employer");
    assertStatus(p, ["pending_confirmation", "confirmed", "in_progress"], "hold payment");
    if (p.payment_status !== "pending" && p.payment_status !== "failed") {
      throw conflict(`Payment is already ${p.payment_status}`, "payment_wrong_status");
    }
    const quote = quotePayment(jobPay(p));
    const amount = quote.employerPaysEtb;
    const returnUrl = `${primaryWebOrigin()}/pairings/${p.id}?payment=return`;
    const callbackUrl = env.PUBLIC_API_URL
      ? `${env.PUBLIC_API_URL.replace(/\/$/, "")}/api/payments/chapa/callback`
      : undefined;
    const held = await paymentProvider.hold({
      pairingId: p.id,
      amountEtb: amount,
      employerPhone: p.employer_phone,
      employerUsername: p.employer_username,
      jobTitle: p.title,
      returnUrl,
      callbackUrl,
    });
    checkoutUrl = held.checkoutUrl ?? null;
    const immediate = held.immediateHold !== false && !checkoutUrl;
    if (immediate) {
      await db.query(
        `update pairings
         set payment_status = 'held', payment_amount_etb = $2, platform_fee_etb = $3,
             worker_payout_etb = $4, payment_external_id = $5,
             payment_checkout_url = null, payment_held_at = now(), updated_at = now()
         where id = $1`,
        [p.id, amount, quote.platformFeeEtb, quote.workerReceivesEtb, held.externalId],
      );
      await recordPaymentEvent(db, {
        pairingId: p.id,
        action: "hold",
        amountEtb: amount,
        externalId: held.externalId,
        actorId: me.id,
      });
      await notify(db, p.worker_id, "payment_held", {
        pairingId: p.id,
        title: p.title,
        amount,
        provider: paymentProvider.name,
      });
    } else {
      await db.query(
        `update pairings
         set payment_status = 'pending', payment_amount_etb = $2, platform_fee_etb = $3,
             worker_payout_etb = $4, payment_external_id = $5,
             payment_checkout_url = $6, updated_at = now()
         where id = $1`,
        [p.id, amount, quote.platformFeeEtb, quote.workerReceivesEtb, held.externalId, checkoutUrl],
      );
      await recordPaymentEvent(db, {
        pairingId: p.id,
        action: "checkout",
        amountEtb: amount,
        externalId: held.externalId,
        actorId: me.id,
        note: "Hosted checkout started",
      });
    }
  });
  const p = await loadPairing(pool, pairingId, me);
  res.json({
    pairing: toPairing(p, me.id, await reviewsFor(pool, [p.id])),
    checkoutUrl,
  });
});

pairingsRouter.post("/pairings/:id/payment/verify", requireAuth, async (req, res) => {
  assertPaymentsOn();
  const me = currentUser(req);
  const pairingId = idParam(req);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, pairingId, me, true);
    assertParty(p, me.id);
    if (p.payment_status === "held" || p.payment_status === "paid") {
      return;
    }
    if (p.payment_status !== "pending") {
      throw conflict(`Payment is already ${p.payment_status}`, "payment_wrong_status");
    }
    if (!p.payment_external_id) throw badRequest("Start checkout before verifying", "payment_checkout_required");
    if (!paymentProvider.verifyHold) {
      throw badRequest("This payment mode does not use hosted checkout verify", "payment_verify_unsupported");
    }
    const amount = Number(p.payment_amount_etb ?? quotePayment(jobPay(p)).employerPaysEtb);
    const result = await paymentProvider.verifyHold({
      pairingId: p.id,
      externalId: p.payment_external_id,
      expectedAmountEtb: amount,
    });
    if (!result.ok) {
      await db.query(`update pairings set payment_status = 'failed', updated_at = now() where id = $1`, [p.id]);
      await recordPaymentEvent(db, {
        pairingId: p.id,
        action: "fail",
        amountEtb: amount,
        externalId: p.payment_external_id,
        actorId: me.id,
        note: "Checkout verify failed",
      });
      throw conflict("Payment not confirmed yet", "payment_not_confirmed");
    }
    await markPairingHeld(db, p, amount, result.reference ?? p.payment_external_id, me.id);
  });
  await respond(res, pairingId, me);
});

pairingsRouter.post("/pairings/:id/payment/release", requireAuth, async (req, res) => {
  assertPaymentsOn();
  if (platformHoldsFunds) {
    throw forbidden("Only an admin can release payment to the worker", "admin_release_required");
  }
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id, "employer");
    if (p.payment_status !== "held") throw conflict("Nothing is held to release", "payment_wrong_status");
    if (!["in_progress", "completed"].includes(p.status)) {
      throw conflict("Release payment after work is underway or completed", "pairing_wrong_status");
    }
    const amount = payoutAmount(p);
    const payout = await db.query(
      `select payout_account_name, payout_account_number, payout_bank_code
       from worker_profiles where user_id = $1`,
      [p.worker_id],
    );
    const row = payout.rows[0];
    const workerPayout =
      row && row.payout_account_number && row.payout_bank_code
        ? {
            accountName: String(row.payout_account_name || ""),
            accountNumber: String(row.payout_account_number),
            bankCode: Number(row.payout_bank_code),
          }
        : null;
    const released = await paymentProvider.release({
      pairingId: p.id,
      amountEtb: amount,
      externalId: p.payment_external_id,
      workerPayout,
    });
    await db.query(
      `update pairings
       set payment_status = 'paid', payment_paid_at = now(),
           payment_external_id = coalesce($2, payment_external_id),
           payment_checkout_url = null, updated_at = now()
       where id = $1`,
      [p.id, released.externalId],
    );
    await recordPaymentEvent(db, {
      pairingId: p.id,
      action: "release",
      amountEtb: amount,
      externalId: released.externalId ?? p.payment_external_id,
      actorId: me.id,
      note: workerPayout ? "Released via transfer" : "Released — merchant balance / manual payout",
    });
    await notify(db, p.worker_id, "payment_released", {
      pairingId: p.id,
      title: p.title,
      amount,
      provider: paymentProvider.name,
    });
  });
  await respond(res, idParam(req), me);
});

pairingsRouter.post("/pairings/:id/payment/mark-paid", requireAuth, async (req, res) => {
  assertPaymentsOn();
  if (platformHoldsFunds) {
    throw forbidden("Payments are held by HojiiGO until an admin releases them", "admin_release_required");
  }
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id);
    if (!["pending", "held", "failed"].includes(p.payment_status as PaymentStatus)) {
      throw conflict(`Payment is already ${p.payment_status}`, "payment_wrong_status");
    }
    if (!["confirmed", "in_progress", "completed"].includes(p.status)) {
      throw conflict("Record payment once the pairing is confirmed", "pairing_wrong_status");
    }
    const quote = quotePayment(jobPay(p));
    const amount = quote.workerReceivesEtb;
    const { externalId } = await paymentProvider.markPaid({ pairingId: p.id, amountEtb: quote.employerPaysEtb });
    await db.query(
      `update pairings
       set payment_status = 'paid', payment_amount_etb = $2, platform_fee_etb = $3, worker_payout_etb = $4,
           payment_external_id = coalesce($5, payment_external_id),
           payment_paid_at = now(), updated_at = now()
       where id = $1`,
      [p.id, quote.employerPaysEtb, quote.platformFeeEtb, amount, externalId],
    );
    await recordPaymentEvent(db, {
      pairingId: p.id,
      action: "mark_paid",
      amountEtb: amount,
      externalId,
      actorId: me.id,
    });
    await notify(db, otherParty(p, me.id), "payment_marked_paid", {
      pairingId: p.id,
      title: p.title,
      amount,
      by: me.username,
    });
  });
  await respond(res, idParam(req), me);
});

pairingsRouter.post("/pairings/:id/payment/refund", requireAuth, async (req, res) => {
  assertPaymentsOn();
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id, "employer");
    if (platformHoldsFunds && !["pending_confirmation", "confirmed"].includes(p.status)) {
      throw forbidden("Ask an admin to refund a job that has already started", "admin_release_required");
    }
    if (p.payment_status !== "held") throw conflict("Only held payments can be refunded", "payment_wrong_status");
    const amount = Number(p.payment_amount_etb ?? quotePayment(jobPay(p)).employerPaysEtb);
    await paymentProvider.refund({ pairingId: p.id, amountEtb: amount, externalId: p.payment_external_id });
    await db.query(
      `update pairings
       set payment_status = 'refunded', payment_refunded_at = now(), updated_at = now()
       where id = $1`,
      [p.id],
    );
    await recordPaymentEvent(db, {
      pairingId: p.id,
      action: "refund",
      amountEtb: amount,
      externalId: p.payment_external_id,
      actorId: me.id,
    });
    await notify(db, p.worker_id, "payment_refunded", { pairingId: p.id, title: p.title, amount });
  });
  await respond(res, idParam(req), me);
});

pairingsRouter.post("/pairings/:id/dispute", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = disputeCreateSchema.parse(req.body);
  await withTransaction(async (db) => {
    const p = await loadPairing(db, idParam(req), me, true);
    assertParty(p, me.id);
    assertStatus(p, ["pending_confirmation", "confirmed", "in_progress"], "dispute");
    const open = await db.query("select 1 from disputes where pairing_id = $1 and status = 'open'", [p.id]);
    if (open.rowCount) throw conflict("This pairing already has an open dispute", "dispute_already_open");

    await db.query(
      `insert into disputes (pairing_id, opened_by, reason, prior_status)
       values ($1, $2, $3, $4)`,
      [p.id, me.id, body.reason, p.status],
    );
    await db.query("update pairings set status = 'disputed', updated_at = now() where id = $1", [p.id]);
    await notify(db, otherParty(p, me.id), "pairing_disputed", {
      pairingId: p.id,
      title: p.title,
      opener: me.username,
    });
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

    const payStatus = initialPaymentStatus();
    const pairing = await db.query(
      `insert into pairings (job_id, employer_id, worker_id, status, confirmed_at, payment_status)
       values ($1, $2, $3, 'confirmed', now(), $4) returning id`,
      [rb.new_job_id, rb.employer_id, me.id, payStatus],
    );
    const id = pairing.rows[0].id as string;
    if (payStatus !== "not_required") {
      await recordPaymentEvent(db, { pairingId: id, action: "create", amountEtb: null, actorId: me.id });
    }
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
