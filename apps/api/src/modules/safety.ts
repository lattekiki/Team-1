import { Router } from "express";
import {
  reportCreateSchema,
  verificationCreateSchema,
  type Notification,
  type VerificationRecord,
} from "@team1/shared";
import { pool } from "../db/pool.ts";
import { currentUser, requireAuth } from "../lib/auth.ts";
import { conflict } from "../lib/errors.ts";

export const safetyRouter = Router();

safetyRouter.post("/reports", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = reportCreateSchema.parse(req.body);
  const { rows } = await pool.query(
    "insert into reports (reporter_id, target_type, target_id, reason) values ($1, $2, $3, $4) returning id",
    [me.id, body.targetType, body.targetId, body.reason],
  );
  res.status(201).json({ report: { id: rows[0].id, status: "open" } });
});

const toVerification = (r: Record<string, any>): VerificationRecord => ({
  id: r.id,
  kind: r.kind,
  note: r.note,
  status: r.status,
  reviewNote: r.review_note,
  createdAt: r.created_at,
  reviewedAt: r.reviewed_at,
});

safetyRouter.get("/me/verification", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const { rows } = await pool.query(
    "select * from verification_records where user_id = $1 order by created_at desc",
    [me.id],
  );
  res.json({ records: rows.map(toVerification) });
});

safetyRouter.post("/verification", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = verificationCreateSchema.parse(req.body);
  const pending = await pool.query(
    "select 1 from verification_records where user_id = $1 and kind = $2 and status = 'pending'",
    [me.id, body.kind],
  );
  if (pending.rowCount) throw conflict("You already have a pending request of this type");
  const { rows } = await pool.query(
    "insert into verification_records (user_id, kind, note) values ($1, $2, $3) returning *",
    [me.id, body.kind, body.note],
  );
  res.status(201).json({ record: toVerification(rows[0]) });
});

safetyRouter.get("/notifications", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const [list, unread] = await Promise.all([
    pool.query(
      "select id, type, payload, read_at, created_at from notifications where user_id = $1 order by created_at desc limit 50",
      [me.id],
    ),
    pool.query("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [me.id]),
  ]);
  const notifications: Notification[] = list.rows.map((n) => ({
    id: n.id,
    type: n.type,
    payload: n.payload,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
  res.json({ notifications, unread: unread.rows[0].n });
});

safetyRouter.post("/notifications/read", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await pool.query("update notifications set read_at = now() where user_id = $1 and read_at is null", [me.id]);
  res.status(204).end();
});
