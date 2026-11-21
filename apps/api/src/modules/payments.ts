import { Router } from "express";
import { withTransaction } from "../db/pool.ts";
import { extractTxRefFromWebhook, verifyChapaWebhookSignature } from "../lib/chapa.ts";
import { markPairingHeld } from "../lib/payment-hold.ts";
import { paymentsConfig, paymentsMode, paymentProvider, recordPaymentEvent } from "../lib/payments.ts";

export const paymentsRouter = Router();

paymentsRouter.get("/payments/config", (_req, res) => {
  res.json(paymentsConfig());
});

/**
 * Chapa redirect callback (GET with trx_ref / status). Always verify before trusting.
 * Idempotent: safe if webhook already marked held.
 */
paymentsRouter.get("/payments/chapa/callback", async (req, res) => {
  if (paymentsMode !== "chapa") {
    res.status(404).json({ error: { code: "not_found", message: "Chapa payments are not enabled" } });
    return;
  }
  const txRef = String(req.query.trx_ref ?? req.query.tx_ref ?? "");
  if (!txRef) {
    res.status(400).json({ error: { code: "bad_request", message: "Missing trx_ref" } });
    return;
  }
  try {
    await confirmChapaTxRef(txRef);
    res.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Verify failed";
    res.status(409).json({ error: { code: "payment_not_confirmed", message } });
  }
});

/** Chapa dashboard webhook. Signature checked against CHAPA_SECRET_KEY. */
paymentsRouter.post("/payments/webhooks/chapa", async (req, res) => {
  if (paymentsMode !== "chapa") {
    res.status(404).end();
    return;
  }
  const raw =
    (req as { rawBody?: Buffer }).rawBody ??
    Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}));
  const headers = req.headers as Record<string, string | string[] | undefined>;
  if (!verifyChapaWebhookSignature(raw, headers)) {
    res.status(401).json({ error: { code: "unauthorized", message: "Invalid Chapa signature" } });
    return;
  }
  const payload = typeof req.body === "object" && req.body ? req.body : JSON.parse(raw.toString("utf8"));
  const txRef = extractTxRefFromWebhook(payload);
  if (!txRef) {
    res.status(400).json({ error: { code: "bad_request", message: "Missing tx_ref" } });
    return;
  }
  const eventStatus = String(
    (payload as { status?: string }).status ??
      (payload as { event?: string }).event ??
      "",
  ).toLowerCase();
  if (eventStatus.includes("fail") || eventStatus.includes("cancel")) {
    await withTransaction(async (db) => {
      const { rows } = await db.query(
        `select id from pairings where payment_external_id = $1 and payment_status = 'pending' for update`,
        [txRef],
      );
      if (!rows[0]) return;
      await db.query(`update pairings set payment_status = 'failed', updated_at = now() where id = $1`, [rows[0].id]);
      await recordPaymentEvent(db, {
        pairingId: rows[0].id,
        action: "fail",
        amountEtb: null,
        externalId: txRef,
        note: `Webhook: ${eventStatus}`,
      });
    });
    res.json({ ok: true });
    return;
  }
  try {
    await confirmChapaTxRef(txRef);
    res.json({ ok: true });
  } catch {
    // Acknowledge so Chapa does not hammer; client can still call verify.
    res.json({ ok: false });
  }
});

async function confirmChapaTxRef(txRef: string) {
  if (!paymentProvider.verifyHold) throw new Error("Verify not supported");

  await withTransaction(async (db) => {
    const { rows } = await db.query(
      `select p.*, j.title
       from pairings p
       join jobs j on j.id = p.job_id
       where p.payment_external_id = $1
       for update of p`,
      [txRef],
    );
    const p = rows[0];
    if (!p) throw new Error("Unknown payment reference");
    if (p.payment_status === "held" || p.payment_status === "paid" || p.payment_status === "refunded") {
      return;
    }
    const amount = Number(p.payment_amount_etb ?? 0);
    const check = await paymentProvider.verifyHold!({
      pairingId: p.id,
      externalId: txRef,
      expectedAmountEtb: amount,
    });
    if (!check.ok) throw new Error("Amount or status mismatch");
    await markPairingHeld(db, p, amount, check.reference ?? txRef, null);
  });
}

/** Used by health + tests without going through the router singleton config route twice. */
export function paymentsHealthSnippet() {
  return paymentsConfig();
}
