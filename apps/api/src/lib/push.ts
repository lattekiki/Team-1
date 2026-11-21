import { createRequire } from "node:module";
import { env } from "../env.ts";
import { pool } from "../db/pool.ts";

const require = createRequire(import.meta.url);
// web-push is CommonJS; load via require for NodeNext + Vitest.
const webpush = require("web-push") as typeof import("web-push");

export const pushConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (pushConfigured) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || "mailto:pilot@hojiigo.local",
    env.VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!,
  );
}

export function pushPublicKey() {
  return pushConfigured ? env.VAPID_PUBLIC_KEY! : null;
}

/** Short English body for OS notification trays (client may re-translate in-app). */
export function pushCopy(type: string, payload: Record<string, unknown>): { title: string; body: string; url: string } {
  const title = String(payload.title ?? "HojiiGO");
  const pairing = payload.pairingId ? `/pairings/${payload.pairingId}` : null;
  const job = payload.jobId ? `/jobs/${payload.jobId}` : null;
  const ticket = payload.ticketId ? `/tickets/${payload.ticketId}` : null;
  const bodies: Record<string, string> = {
    application_received: `${payload.worker ?? "Someone"} applied to “${title}”`,
    selected: `You were selected for “${title}” — confirm to unlock contact`,
    not_selected: `The employer chose someone else for “${title}”`,
    pairing_confirmed: `Pairing confirmed for “${title}” — contact unlocked`,
    pairing_declined: `${payload.worker ?? "Worker"} declined “${title}”`,
    pairing_cancelled: `“${title}” was cancelled`,
    pairing_disputed: `A dispute was opened on “${title}”`,
    dispute_resolved: `Dispute update on “${title}”`,
    job_cancelled: `“${title}” was cancelled`,
    job_expired: `“${title}” closed — application window ended`,
    work_started: `Work on “${title}” has started`,
    completion_requested: `Please confirm completion for “${title}”`,
    worker_finished: `${payload.worker ?? "A worker"} finished “${title}”. Ask the employer before paying.`,
    worker_reported_done: `${payload.worker ?? "The worker"} says “${title}” is finished.`,
    employer_asked: `An admin asks if “${title}” is finished.`,
    employer_confirmed_work: `${payload.employer ?? "The employer"} confirmed “${title}” is done. You can pay the worker.`,
    pairing_completed: `“${title}” is completed — leave a review`,
    review_received: `New review for “${title}”`,
    rebook_request: `Rebooking request for “${title}”`,
    rebook_accepted: `Rebooking accepted for “${title}”`,
    rebook_declined: `Rebooking declined for “${title}”`,
    verification_updated: `Verification update`,
    report_updated: `Update on your report`,
    ticket_reply: `Support replied to your ticket`,
    ticket_updated: `Your support ticket was updated`,
    payment_held: `Funds held for “${title}”`,
    payment_released: `Payment released for “${title}”`,
    payment_refunded: `Payment refunded for “${title}”`,
    payment_marked_paid: `“${title}” marked as paid`,
  };
  return {
    title: "HojiiGO",
    body: bodies[type] ?? "You have a new update",
    url: pairing ?? job ?? ticket ?? "/notifications",
  };
}

export async function sendPushToUser(userId: string, type: string, payload: Record<string, unknown>) {
  if (!pushConfigured) return;
  const { rows } = await pool.query(
    "select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1",
    [userId],
  );
  if (!rows.length) return;

  const copy = pushCopy(type, payload);
  const data = JSON.stringify({ ...copy, type });

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          data,
          { TTL: 60 * 60 },
        );
      } catch (err: any) {
        const status = err?.statusCode ?? err?.status;
        if (status === 404 || status === 410) {
          await pool.query("delete from push_subscriptions where id = $1", [row.id]);
        } else {
          console.error(`[push] failed for ${row.endpoint.slice(0, 48)}…`, status ?? err);
        }
      }
    }),
  );
}
