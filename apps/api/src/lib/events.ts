import type { Db } from "../db/pool.ts";

export async function notify(db: Db, userId: string, type: string, payload: Record<string, unknown> = {}) {
  await db.query("insert into notifications (user_id, type, payload) values ($1, $2, $3)", [userId, type, payload]);
}

export async function audit(
  db: Db,
  actorId: string | null,
  action: string,
  target: { type: string; id: string } | null,
  details: Record<string, unknown> = {},
) {
  await db.query(
    "insert into audit_logs (actor_id, action, target_type, target_id, details) values ($1, $2, $3, $4, $5)",
    [actorId, action, target?.type ?? null, target?.id ?? null, details],
  );
}
