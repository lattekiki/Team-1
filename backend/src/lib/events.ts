import type { Db } from "../db/pool.ts";
import { pool } from "../db/pool.ts";
import { env } from "../env.ts";
import { sendPushToUser } from "./push.ts";
import { SMS_NOTIFY_TYPES, smsBody, smsSender } from "./sms.ts";

export async function notify(db: Db, userId: string, type: string, payload: Record<string, unknown> = {}) {
  await db.query("insert into notifications (user_id, type, payload) values ($1, $2, $3)", [userId, type, payload]);
  // Fire-and-forget delivery outside the DB transaction path.
  deliverOutOfBand(userId, type, payload).catch((err) => console.error("[notify] out-of-band failed", err));
}

async function deliverOutOfBand(userId: string, type: string, payload: Record<string, unknown>) {
  try {
    await sendPushToUser(userId, type, payload);
  } catch (err) {
    console.error("[push] deliver failed", err);
  }
  if (!env.NOTIFY_SMS || !SMS_NOTIFY_TYPES.has(type)) return;
  try {
    const { rows } = await pool.query("select phone from users where id = $1", [userId]);
    const phone = rows[0]?.phone as string | undefined;
    if (!phone) return;
    await smsSender.send(phone, smsBody(type, payload));
  } catch (err) {
    console.error("[sms] notify failed", err);
  }
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
