import { env } from "../env.ts";
import type { Db } from "../db/pool.ts";

export type PaymentMode = "off" | "manual" | "mock_escrow";
export type PaymentAction = "hold" | "release" | "mark_paid" | "refund";

export type PaymentStatus = "not_required" | "pending" | "held" | "paid" | "refunded" | "failed";

export interface PaymentProvider {
  readonly name: string;
  /** Soft-hold funds (mock) or record that the employer set money aside (manual). */
  hold(input: { pairingId: string; amountEtb: number }): Promise<{ externalId: string | null }>;
  /** Release held funds to the worker (mock) or confirm payout (manual). */
  release(input: { pairingId: string; amountEtb: number; externalId: string | null }): Promise<void>;
  /** Record that payment was settled outside the platform (cash / bank / wallet). */
  markPaid(input: { pairingId: string; amountEtb: number }): Promise<{ externalId: string | null }>;
  /** Return held funds to the employer. */
  refund(input: { pairingId: string; amountEtb: number; externalId: string | null }): Promise<void>;
}

/** No platform payment tracking — parties settle directly (MVP default). */
export class OffPaymentProvider implements PaymentProvider {
  readonly name = "off";
  async hold(): Promise<{ externalId: string | null }> {
    throw new Error("Payments are disabled");
  }
  async release(): Promise<void> {
    throw new Error("Payments are disabled");
  }
  async markPaid(): Promise<{ externalId: string | null }> {
    throw new Error("Payments are disabled");
  }
  async refund(): Promise<void> {
    throw new Error("Payments are disabled");
  }
}

/**
 * Record-only payment tracking. No money moves through HojiiGO.
 * Use until legal review approves a real escrow/payment rail (SRS §12).
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly name = "manual";
  async hold() {
    return { externalId: null };
  }
  async release() {}
  async markPaid() {
    return { externalId: null };
  }
  async refund() {}
}

/**
 * Simulated escrow ledger for UX/testing. Generates fake external IDs;
 * does not contact a bank or wallet. Replace with a licensed provider after legal review.
 */
export class MockEscrowPaymentProvider implements PaymentProvider {
  readonly name = "mock_escrow";
  async hold(input: { pairingId: string; amountEtb: number }) {
    const externalId = `mock_hold_${input.pairingId.slice(0, 8)}_${Date.now()}`;
    console.log(`[payments:mock_escrow] HOLD ${input.amountEtb} ETB pairing=${input.pairingId} id=${externalId}`);
    return { externalId };
  }
  async release(input: { pairingId: string; amountEtb: number; externalId: string | null }) {
    console.log(
      `[payments:mock_escrow] RELEASE ${input.amountEtb} ETB pairing=${input.pairingId} id=${input.externalId ?? "n/a"}`,
    );
  }
  async markPaid(input: { pairingId: string; amountEtb: number }) {
    const externalId = `mock_paid_${input.pairingId.slice(0, 8)}_${Date.now()}`;
    console.log(`[payments:mock_escrow] MARK_PAID ${input.amountEtb} ETB pairing=${input.pairingId}`);
    return { externalId };
  }
  async refund(input: { pairingId: string; amountEtb: number; externalId: string | null }) {
    console.log(
      `[payments:mock_escrow] REFUND ${input.amountEtb} ETB pairing=${input.pairingId} id=${input.externalId ?? "n/a"}`,
    );
  }
}

export function createPaymentProvider(): PaymentProvider {
  switch (env.PAYMENTS_MODE) {
    case "manual":
      return new ManualPaymentProvider();
    case "mock_escrow":
      return new MockEscrowPaymentProvider();
    default:
      return new OffPaymentProvider();
  }
}

export const paymentProvider = createPaymentProvider();
export const paymentsMode: PaymentMode = env.PAYMENTS_MODE;
export const paymentsEnabled = paymentsMode !== "off";

/** Initial payment_status when a pairing is created. */
export function initialPaymentStatus(): PaymentStatus {
  return paymentsEnabled ? "pending" : "not_required";
}

export async function recordPaymentEvent(
  db: Db,
  input: {
    pairingId: string;
    action: PaymentAction | "create";
    amountEtb: number | null;
    externalId?: string | null;
    note?: string;
    actorId?: string | null;
  },
) {
  await db.query(
    `insert into payment_events (pairing_id, provider, action, amount_etb, external_id, note, actor_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.pairingId,
      paymentProvider.name,
      input.action,
      input.amountEtb,
      input.externalId ?? null,
      input.note ?? "",
      input.actorId ?? null,
    ],
  );
}

export function paymentsConfig() {
  return {
    mode: paymentsMode,
    enabled: paymentsEnabled,
    /** True when hold/release (escrow-style) actions are available. */
    escrow: paymentsMode === "mock_escrow" || paymentsMode === "manual",
    /** Disclaimer for the UI — no licensed money movement yet. */
    disclaimer:
      paymentsMode === "mock_escrow"
        ? "Simulated escrow for testing only — no real money is held."
        : paymentsMode === "manual"
          ? "Record payments you settle directly. HojiiGO does not hold funds."
          : "Platform payments are off — settle directly with the other party.",
  };
}
