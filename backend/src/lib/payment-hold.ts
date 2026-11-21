import type { Db } from "../db/pool.ts";
import { notify } from "./events.ts";
import { paymentProvider, recordPaymentEvent } from "./payments.ts";

/** Mark a pending hosted checkout as held after verify/webhook. */
export async function markPairingHeld(
  db: Db,
  p: {
    id: string;
    worker_id: string;
    title: string;
  },
  amount: number,
  externalId: string | null,
  actorId: string | null,
) {
  await db.query(
    `update pairings
     set payment_status = 'held', payment_amount_etb = $2, payment_external_id = coalesce($3, payment_external_id),
         payment_checkout_url = null, payment_held_at = now(), updated_at = now()
     where id = $1 and payment_status in ('pending', 'failed')`,
    [p.id, amount, externalId],
  );
  await recordPaymentEvent(db, {
    pairingId: p.id,
    action: "verify",
    amountEtb: amount,
    externalId,
    actorId,
    note: "Checkout confirmed",
  });
  await notify(db, p.worker_id, "payment_held", {
    pairingId: p.id,
    title: p.title,
    amount,
    provider: paymentProvider.name,
  });
}
