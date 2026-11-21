import { Router } from "express";
import { z } from "zod";
import { adminDecisionSchema, disputeResolveSchema, reportResolveSchema } from "@team1/shared";
import { pool, withTransaction } from "../db/pool.ts";
import { currentUser, requireRole } from "../lib/auth.ts";
import { idParam } from "../lib/http.ts";
import { conflict, notFound } from "../lib/errors.ts";
import { audit, notify } from "../lib/events.ts";
import { paymentProvider, paymentsMode, recordPaymentEvent } from "../lib/payments.ts";
import { reputationFor } from "../lib/stats.ts";

export const adminRouter = Router();

const staff = requireRole("admin", "support");
const adminOnly = requireRole("admin");

adminRouter.get("/admin/overview", staff, async (_req, res) => {
  const { rows } = await pool.query(
    `select
       (select count(*) from reports where status in ('open', 'reviewing'))::int as open_reports,
       (select count(*) from disputes where status = 'open')::int as open_disputes,
       (select count(*) from support_tickets where status in ('open', 'waiting_staff', 'waiting_user'))::int as open_tickets,
       (select count(*) from verification_records where status = 'pending')::int as pending_verifications,
       (select count(*) from users)::int as users,
       (select count(*) from jobs where status = 'published')::int as open_jobs,
       (select count(*) from pairings where status in ('confirmed', 'in_progress'))::int as active_pairings,
       (select count(*) from pairings where status = 'completed')::int as completed_pairings,
       (select count(*) from pairings where payment_status = 'held' and status = 'completed')::int as payouts_ready,
       (select count(*) from organization_inquiries where status = 'new')::int as new_inquiries`,
  );
  const r = rows[0];
  res.json({
    overview: {
      openReports: r.open_reports,
      openDisputes: r.open_disputes,
      openTickets: r.open_tickets,
      pendingVerifications: r.pending_verifications,
      users: r.users,
      openJobs: r.open_jobs,
      activePairings: r.active_pairings,
      completedPairings: r.completed_pairings,
      payoutsReady: r.payouts_ready,
      newInquiries: r.new_inquiries,
    },
  });
});

adminRouter.get("/admin/payments", staff, async (_req, res) => {
  const { rows } = await pool.query(
    `select p.id, p.status, p.payment_status, p.payment_amount_etb, p.worker_payout_etb, p.platform_fee_etb,
            p.admin_confirmed_at, p.updated_at,
            j.title, wu.username as worker_username, eu.username as employer_username
     from pairings p
     join jobs j on j.id = p.job_id
     join users wu on wu.id = p.worker_id
     join users eu on eu.id = p.employer_id
     where p.payment_status in ('pending', 'held', 'paid')
     order by (p.payment_status = 'held' and p.admin_confirmed_at is null) desc,
              (p.payment_status = 'held' and p.admin_confirmed_at is not null) desc,
              p.updated_at desc
     limit 80`,
  );
  res.json({
    payments: rows.map((r) => ({
      id: r.id,
      status: r.status,
      paymentStatus: r.payment_status,
      adminConfirmed: Boolean(r.admin_confirmed_at),
      amountEtb: r.payment_amount_etb != null ? Number(r.payment_amount_etb) : null,
      workerPayoutEtb: r.worker_payout_etb != null ? Number(r.worker_payout_etb) : null,
      platformFeeEtb: r.platform_fee_etb != null ? Number(r.platform_fee_etb) : null,
      title: r.title,
      workerUsername: r.worker_username,
      employerUsername: r.employer_username,
      updatedAt: r.updated_at,
    })),
  });
});

adminRouter.post("/admin/pairings/:id/confirm-work", adminOnly, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      `select p.*, j.title
       from pairings p join jobs j on j.id = p.job_id
       where p.id = $1 for update of p`,
      [idParam(req)],
    );
    const p = rows[0];
    if (!p) throw notFound("Pairing not found");
    if (!["in_progress", "completed"].includes(p.status)) {
      throw conflict("Confirm the job after work has started", "pairing_wrong_status");
    }
    if (!p.admin_confirmed_at) {
      await db.query(
        `update pairings set
           admin_confirmed_at = now(),
           status = 'completed',
           started_at = coalesce(started_at, now()),
           employer_completed_at = coalesce(employer_completed_at, now()),
           worker_completed_at = coalesce(worker_completed_at, now()),
           completed_at = coalesce(completed_at, now()),
           updated_at = now()
         where id = $1`,
        [p.id],
      );
      await audit(db, me.id, "pairing.confirm_work", { type: "pairing", id: p.id }, {});
      await notify(db, p.worker_id, "work_confirmed_by_admin", { pairingId: p.id, title: p.title });
      await notify(db, p.employer_id, "work_confirmed_by_admin", { pairingId: p.id, title: p.title });
    }
  });
  res.json({ ok: true });
});

adminRouter.post("/admin/pairings/:id/payment/release", adminOnly, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      `select p.*, j.title
       from pairings p join jobs j on j.id = p.job_id
       where p.id = $1 for update of p`,
      [idParam(req)],
    );
    const p = rows[0];
    if (!p) throw notFound("Pairing not found");
    if (p.payment_status !== "held") throw conflict("Nothing is held to release", "payment_wrong_status");
    if (!p.admin_confirmed_at) {
      throw conflict("Confirm the work is done before paying the worker", "admin_confirm_required");
    }
    if (p.status !== "completed") {
      throw conflict("Release payment after the work is confirmed", "pairing_wrong_status");
    }
    const amount = Number(p.worker_payout_etb ?? p.payment_amount_etb ?? 0);
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
      `update pairings set payment_status = 'paid', payment_paid_at = now(),
         payment_external_id = coalesce($2, payment_external_id), updated_at = now()
       where id = $1`,
      [p.id, released.externalId],
    );
    await recordPaymentEvent(db, {
      pairingId: p.id,
      action: "release",
      amountEtb: amount,
      externalId: released.externalId ?? p.payment_external_id,
      actorId: me.id,
      note: paymentsMode === "chapa" ? "Admin payout after confirming the work" : "Recorded payout. No bank transfer.",
    });
    await audit(db, me.id, "payment.release", { type: "pairing", id: p.id }, { amount });
    await notify(db, p.worker_id, "payment_released", {
      pairingId: p.id,
      title: p.title,
      amount,
      provider: paymentProvider.name,
    });
  });
  res.json({ ok: true });
});

adminRouter.get("/admin/reports", staff, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const { rows } = await pool.query(
    `select r.*, u.username as reporter, ru.username as resolved_by_username
     from reports r join users u on u.id = r.reporter_id
     left join users ru on ru.id = r.resolved_by
     where ($1::text is null or r.status = $1)
     order by (r.status in ('open', 'reviewing')) desc, r.created_at desc limit 100`,
    [status],
  );
  res.json({
    reports: rows.map((r) => ({
      id: r.id,
      reporter: r.reporter,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      status: r.status,
      resolutionNote: r.resolution_note,
      resolvedBy: r.resolved_by_username,
      createdAt: r.created_at,
    })),
  });
});

adminRouter.post("/admin/reports/:id/resolve", adminOnly, async (req, res) => {
  const me = currentUser(req);
  const body = reportResolveSchema.parse(req.body);
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      `update reports set status = $2, resolution_note = $3, resolved_by = $4,
         resolved_at = case when $2 in ('resolved', 'dismissed') then now() else null end
       where id = $1 returning reporter_id`,
      [idParam(req), body.status, body.note ?? null, me.id],
    );
    if (!rows[0]) throw notFound("Report not found");
    await audit(db, me.id, "report.update", { type: "report", id: idParam(req) }, body);
    await notify(db, rows[0].reporter_id, "report_updated", { reportId: idParam(req), status: body.status });
  });
  res.json({ ok: true });
});

adminRouter.get("/admin/disputes", staff, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const { rows } = await pool.query(
    `select d.*, j.title, p.job_id, wu.username as worker_username, eu.username as employer_username,
            ou.username as opener_username, ru.username as resolved_by_username
     from disputes d
     join pairings p on p.id = d.pairing_id
     join jobs j on j.id = p.job_id
     join users wu on wu.id = p.worker_id
     join users eu on eu.id = p.employer_id
     join users ou on ou.id = d.opened_by
     left join users ru on ru.id = d.resolved_by
     where ($1::text is null or d.status = $1)
     order by (d.status = 'open') desc, d.created_at desc
     limit 100`,
    [status],
  );
  res.json({
    disputes: rows.map((d) => ({
      id: d.id,
      pairingId: d.pairing_id,
      jobId: d.job_id,
      title: d.title,
      reason: d.reason,
      priorStatus: d.prior_status,
      status: d.status,
      opener: d.opener_username,
      worker: d.worker_username,
      employer: d.employer_username,
      resolutionNote: d.resolution_note,
      resolvedBy: d.resolved_by_username,
      createdAt: d.created_at,
      resolvedAt: d.resolved_at,
    })),
  });
});

adminRouter.post("/admin/disputes/:id/resolve", adminOnly, async (req, res) => {
  const me = currentUser(req);
  const body = disputeResolveSchema.parse(req.body);
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      `select d.*, p.worker_id, p.employer_id, p.job_id, j.title
       from disputes d
       join pairings p on p.id = d.pairing_id
       join jobs j on j.id = p.job_id
       where d.id = $1 for update of d`,
      [idParam(req)],
    );
    const d = rows[0];
    if (!d) throw notFound("Dispute not found");
    if (d.status !== "open") throw conflict(`This dispute is already ${d.status}`, "dispute_already_resolved");

    const nextDisputeStatus = body.resolution === "resume" ? "resolved_resume" : "resolved_cancel";
    await db.query(
      `update disputes set status = $2, resolution_note = $3, resolved_by = $4, resolved_at = now(), updated_at = now()
       where id = $1`,
      [d.id, nextDisputeStatus, body.note ?? null, me.id],
    );

    if (body.resolution === "resume") {
      await db.query("update pairings set status = $2, updated_at = now() where id = $1", [d.pairing_id, d.prior_status]);
    } else {
      await db.query(
        `update pairings set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, updated_at = now()
         where id = $1`,
        [d.pairing_id, me.id],
      );
      await db.query("update jobs set status = 'published', updated_at = now() where id = $1 and status = 'filled'", [
        d.job_id,
      ]);
    }

    await audit(db, me.id, "dispute.resolve", { type: "dispute", id: d.id }, body);
    const payload = {
      pairingId: d.pairing_id,
      title: d.title,
      resolution: body.resolution,
    };
    await notify(db, d.worker_id, "dispute_resolved", payload);
    await notify(db, d.employer_id, "dispute_resolved", payload);
  });
  res.json({ ok: true });
});

adminRouter.get("/admin/verification", staff, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const { rows } = await pool.query(
    `select v.*, u.username, u.identity_verified, u.high_trust_approved
     from verification_records v join users u on u.id = v.user_id
     where v.status = $1 order by v.created_at limit 100`,
    [status],
  );
  const rep = await reputationFor(
    pool,
    rows.map((r) => r.user_id),
  );
  const docs =
    rows.length === 0
      ? { rows: [] as Record<string, any>[] }
      : await pool.query(
          `select * from verification_documents where verification_id = any($1::uuid[]) order by created_at`,
          [rows.map((r) => r.id)],
        );
  const byRecord = new Map<string, typeof docs.rows>();
  for (const d of docs.rows) {
    const list = byRecord.get(d.verification_id) ?? [];
    list.push(d);
    byRecord.set(d.verification_id, list);
  }
  res.json({
    records: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      username: r.username,
      kind: r.kind,
      note: r.note,
      status: r.status,
      identityVerified: r.identity_verified,
      highTrustApproved: r.high_trust_approved,
      rating: rep.get(r.user_id)?.rating ?? null,
      completedJobs: rep.get(r.user_id)?.completedJobs ?? 0,
      createdAt: r.created_at,
      documents: (byRecord.get(r.id) ?? []).map((d) => ({
        id: d.id,
        originalName: d.original_name,
        mimeType: d.mime_type,
        sizeBytes: d.size_bytes,
        createdAt: d.created_at,
      })),
    })),
  });
});

async function decide(adminId: string, recordId: string, approve: boolean, note: string | undefined) {
  await withTransaction(async (db) => {
    const { rows } = await db.query("select * from verification_records where id = $1 for update", [recordId]);
    const rec = rows[0];
    if (!rec) throw notFound("Verification request not found");
    if (rec.status !== "pending") throw conflict(`This request was already ${rec.status}`, "request_already_decided");

    if (approve && rec.kind === "high_trust") {
      const user = await db.query("select identity_verified from users where id = $1", [rec.user_id]);
      if (!user.rows[0]?.identity_verified) {
        throw conflict("Approve identity verification before granting high-trust (VIP) access", "identity_first");
      }
    }
    await db.query(
      `update verification_records set status = $2, reviewer_id = $3, review_note = $4, reviewed_at = now()
       where id = $1`,
      [rec.id, approve ? "approved" : "rejected", adminId, note ?? null],
    );
    if (approve && rec.kind === "identity") {
      await db.query("update users set identity_verified = true, updated_at = now() where id = $1", [rec.user_id]);
    }
    if (approve && rec.kind === "high_trust") {
      await db.query("update users set high_trust_approved = true, updated_at = now() where id = $1", [rec.user_id]);
    }
    await audit(db, adminId, approve ? "verification.approve" : "verification.reject", {
      type: "verification",
      id: rec.id,
    }, { kind: rec.kind, userId: rec.user_id, note });
    await notify(db, rec.user_id, "verification_updated", { kind: rec.kind, status: approve ? "approved" : "rejected" });
  });
}

adminRouter.post("/admin/verification/:id/approve", adminOnly, async (req, res) => {
  const { note } = adminDecisionSchema.parse(req.body ?? {});
  await decide(currentUser(req).id, idParam(req), true, note);
  res.json({ ok: true });
});

adminRouter.post("/admin/verification/:id/reject", adminOnly, async (req, res) => {
  const { note } = adminDecisionSchema.parse(req.body ?? {});
  await decide(currentUser(req).id, idParam(req), false, note);
  res.json({ ok: true });
});

adminRouter.get("/admin/users", staff, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const { rows } = await pool.query(
    `select id, username, role, status, identity_verified, high_trust_approved, created_at
     from users where ($1 = '' or username ilike $2)
     order by created_at desc limit 50`,
    [q, `%${q}%`],
  );
  res.json({
    users: rows.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      status: u.status,
      identityVerified: u.identity_verified,
      highTrustApproved: u.high_trust_approved,
      createdAt: u.created_at,
    })),
  });
});

const flagSchema = z.object({ value: z.boolean(), note: z.string().trim().max(500).optional() });

adminRouter.post("/admin/users/:id/high-trust", adminOnly, async (req, res) => {
  const me = currentUser(req);
  const { value, note } = flagSchema.parse(req.body);
  await withTransaction(async (db) => {
    const user = (await db.query("select identity_verified from users where id = $1 for update", [idParam(req)]))
      .rows[0];
    if (!user) throw notFound("User not found");
    if (value && !user.identity_verified) {
      throw conflict("Verify the user's identity before granting high-trust access", "identity_first");
    }
    await db.query("update users set high_trust_approved = $2, updated_at = now() where id = $1", [
      idParam(req),
      value,
    ]);
    await audit(db, me.id, value ? "user.high_trust.grant" : "user.high_trust.revoke", {
      type: "user",
      id: idParam(req),
    }, { note });
  });
  res.json({ ok: true });
});

adminRouter.post("/admin/users/:id/suspend", adminOnly, async (req, res) => {
  const me = currentUser(req);
  const { value, note } = flagSchema.parse(req.body);
  if (idParam(req) === me.id) throw conflict("You cannot suspend your own account", "cannot_suspend_self");
  await withTransaction(async (db) => {
    const { rowCount } = await db.query("update users set status = $2, updated_at = now() where id = $1", [
      idParam(req),
      value ? "suspended" : "active",
    ]);
    if (!rowCount) throw notFound("User not found");
    if (value) await db.query("delete from sessions where user_id = $1", [idParam(req)]);
    await audit(db, me.id, value ? "user.suspend" : "user.reinstate", { type: "user", id: idParam(req) }, { note });
  });
  res.json({ ok: true });
});

adminRouter.get("/admin/audit", adminOnly, async (_req, res) => {
  const { rows } = await pool.query(
    `select a.id, a.action, a.target_type, a.target_id, a.details, a.created_at, u.username as actor
     from audit_logs a left join users u on u.id = a.actor_id
     order by a.created_at desc limit 100`,
  );
  res.json({
    entries: rows.map((a) => ({
      id: String(a.id),
      actor: a.actor,
      action: a.action,
      targetType: a.target_type,
      targetId: a.target_id,
      details: a.details,
      createdAt: a.created_at,
    })),
  });
});
