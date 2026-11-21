import { env } from "../env.ts";
import type { Db } from "../db/pool.ts";
import {
  chapaEmail,
  chapaInitialize,
  chapaPhone,
  chapaRefund,
  chapaTransfer,
  chapaVerify,
  isChapaSuccessStatus,
  makeTxRef,
} from "./chapa.ts";

export type PaymentMode = "off" | "manual" | "mock_escrow" | "chapa";
export type PaymentAction = "hold" | "release" | "mark_paid" | "refund" | "checkout" | "verify";

export type PaymentStatus = "not_required" | "pending" | "held" | "paid" | "refunded" | "failed";

export type HoldResult = {
  externalId: string | null;
  /** When set, employer must complete hosted checkout before funds are held. */
  checkoutUrl?: string | null;
  /** false = checkout opened; confirm later via verify/webhook. */
  immediateHold?: boolean;
};

export type ReleaseInput = {
  pairingId: string;
  amountEtb: number;
  externalId: string | null;
  workerPayout?: {
    accountName: string;
    accountNumber: string;
    bankCode: number;
  } | null;
};

export interface PaymentProvider {
  readonly name: string;
  hold(input: {
    pairingId: string;
    amountEtb: number;
    employerPhone: string;
    employerUsername: string;
    jobTitle: string;
    returnUrl: string;
    callbackUrl?: string;
  }): Promise<HoldResult>;
  release(input: ReleaseInput): Promise<{ externalId: string | null }>;
  markPaid(input: { pairingId: string; amountEtb: number }): Promise<{ externalId: string | null }>;
  refund(input: { pairingId: string; amountEtb: number; externalId: string | null }): Promise<void>;
  /** Confirm a hosted checkout (Chapa). No-op for record-only modes. */
  verifyHold?(input: { pairingId: string; externalId: string; expectedAmountEtb: number }): Promise<{
    ok: boolean;
    reference: string | null;
  }>;
}

/** No platform payment tracking — parties settle directly (MVP default). */
export class OffPaymentProvider implements PaymentProvider {
  readonly name = "off";
  async hold(): Promise<HoldResult> {
    throw new Error("Payments are disabled");
  }
  async release(): Promise<{ externalId: string | null }> {
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
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly name = "manual";
  async hold() {
    return { externalId: null, immediateHold: true };
  }
  async release() {
    return { externalId: null };
  }
  async markPaid() {
    return { externalId: null };
  }
  async refund() {}
}

/**
 * Records that the employer owes HojiiGO and that an admin approved the payout.
 * Does not contact a bank, wallet, or a fake transfer service.
 */
export class LedgerPaymentProvider implements PaymentProvider {
  readonly name = "ledger";
  async hold() {
    return { externalId: null, immediateHold: true };
  }
  async release() {
    return { externalId: null };
  }
  async markPaid() {
    return { externalId: null };
  }
  async refund() {}
}

/**
 * Licensed Chapa rail (Ethiopia): employer pays via hosted checkout → funds held in merchant balance;
 * release pays out to worker bank details when present, otherwise marks paid for manual Chapa dashboard payout;
 * refund uses Chapa Refund API.
 */
export class ChapaPaymentProvider implements PaymentProvider {
  readonly name = "chapa";

  async hold(input: {
    pairingId: string;
    amountEtb: number;
    employerPhone: string;
    employerUsername: string;
    jobTitle: string;
    returnUrl: string;
    callbackUrl?: string;
  }): Promise<HoldResult> {
    const txRef = makeTxRef(input.pairingId);
    const nameParts = input.employerUsername.replace(/_/g, " ").split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "Employer";
    const lastName = nameParts.slice(1).join(" ") || "HojiiGO";
    const { checkoutUrl } = await chapaInitialize({
      amountEtb: input.amountEtb,
      txRef,
      email: chapaEmail(input.employerUsername),
      firstName,
      lastName,
      phone: chapaPhone(input.employerPhone),
      returnUrl: input.returnUrl,
      callbackUrl: input.callbackUrl,
      title: "HojiiGO",
      description: input.jobTitle,
    });
    return { externalId: txRef, checkoutUrl, immediateHold: false };
  }

  async verifyHold(input: { pairingId: string; externalId: string; expectedAmountEtb: number }) {
    const v = await chapaVerify(input.externalId);
    if (!isChapaSuccessStatus(v.status)) return { ok: false, reference: v.reference };
    if (v.currency && v.currency.toUpperCase() !== "ETB") return { ok: false, reference: v.reference };
    if (v.amount > 0 && Math.abs(v.amount - input.expectedAmountEtb) > 0.5) {
      return { ok: false, reference: v.reference };
    }
    return { ok: true, reference: v.reference };
  }

  async release(input: ReleaseInput) {
    const payout = input.workerPayout;
    if (
      payout &&
      payout.accountNumber.trim() &&
      payout.accountName.trim() &&
      Number.isFinite(payout.bankCode) &&
      payout.bankCode > 0
    ) {
      const reference = `rel-${input.pairingId.replace(/-/g, "").slice(0, 10)}-${Date.now()}`;
      const t = await chapaTransfer({
        accountNumber: payout.accountNumber.trim(),
        accountName: payout.accountName.trim(),
        amountEtb: input.amountEtb,
        bankCode: payout.bankCode,
        reference,
      });
      return { externalId: t.reference };
    }
    console.log(
      `[payments:chapa] RELEASE recorded without transfer (no worker payout details) pairing=${input.pairingId} amount=${input.amountEtb}`,
    );
    return { externalId: input.externalId };
  }

  async markPaid(input: { pairingId: string; amountEtb: number }) {
    return { externalId: `chapa_manual_${input.pairingId.slice(0, 8)}_${Date.now()}` };
  }

  async refund(input: { pairingId: string; amountEtb: number; externalId: string | null }) {
    if (!input.externalId) throw new Error("Missing Chapa transaction reference for refund");
    await chapaRefund(input.externalId, { amountEtb: input.amountEtb, reason: "HojiiGO pairing refund" });
  }
}

export function createPaymentProvider(): PaymentProvider {
  switch (env.PAYMENTS_MODE) {
    case "manual":
      return new ManualPaymentProvider();
    case "mock_escrow":
      return new LedgerPaymentProvider();
    case "chapa":
      return new ChapaPaymentProvider();
    default:
      return new OffPaymentProvider();
  }
}

export const paymentProvider = createPaymentProvider();
export const paymentsMode: PaymentMode = env.PAYMENTS_MODE;
export const paymentsEnabled = paymentsMode !== "off";
/** Employer pays HojiiGO first; only an admin releases funds to the worker. */
export const platformHoldsFunds = paymentsMode === "mock_escrow" || paymentsMode === "chapa";

/** Initial payment_status when a pairing is created. */
export function initialPaymentStatus(): PaymentStatus {
  return paymentsEnabled ? "pending" : "not_required";
}

export async function recordPaymentEvent(
  db: Db,
  input: {
    pairingId: string;
    action: PaymentAction | "create" | "fail";
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
  const escrow = paymentsMode === "mock_escrow" || paymentsMode === "manual" || paymentsMode === "chapa";
  return {
    mode: paymentsMode,
    enabled: paymentsEnabled,
    escrow,
    hostedCheckout: paymentsMode === "chapa",
    platformHolds: platformHoldsFunds,
    provider: paymentProvider.name,
    disclaimer:
      paymentsMode === "mock_escrow"
        ? "Payment is recorded only. No money is transferred until Chapa is connected. An admin confirms the work, then records the payout to the worker."
        : paymentsMode === "manual"
          ? "Record payments you settle directly. HojiiGO does not hold funds."
          : paymentsMode === "chapa"
            ? "Pay with Chapa (Telebirr, cards, banks). Funds stay with HojiiGO until an admin confirms the work and pays the worker."
            : "Platform payments are off — settle directly with the other party.",
  };
}
