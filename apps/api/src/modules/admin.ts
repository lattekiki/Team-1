import { Router } from "express";
import { z } from "zod";
import { adminDecisionSchema, disputeResolveSchema, reportResolveSchema } from "@team1/shared";
import { pool, withTransaction } from "../db/pool.ts";
import { currentUser, requireRole } from "../lib/auth.ts";
import { idParam } from "../lib/http.ts";
import { conflict, notFound } from "../lib/errors.ts";
import { audit, notify } from "../lib/events.ts";
import { reputationFor } from "../lib/stats.ts";

export const adminRouter = Router();

const staff = requireRole("admin", "support");
const adminOnly = requireRole("admin");

adminRouter.get("/admin/overview", staff, async (_req, res) => {
  const { rows } = await pool.query(
    `select
       (select count(*) from reports where status in ('open', 'reviewing'))::int as open_reports,
       (select count(*) from disputes where status = 'open')::int as open_disputes,
       (select count(*) from verification_records where status = 'pending')::int as pending_verifications,
       (select count(*) from users)::int as users,
       (select count(*) from jobs where status = 'published')::int as open_jobs,
       (select count(*) from pairings where status in ('confirmed', 'in_progress'))::int as active_pairings,
       (select count(*) from pairings where status = 'completed')::int as completed_pairings`,
  );
  const r = rows[0];
  res.json({
    overview: {
      openReports: r.open_reports,
      openDisputes: r.open_disputes,
      pendingVerifications: r.pending_verifications,
      users: r.users,
      openJobs: r.open_jobs,
      activePairings: r.active_pairings,
      completedPairings: r.completed_pairings,
    },
  });
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
