import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.ts";

const DEFAULT_BASE = "https://api.chapa.co/v1";

export type ChapaInitResult = {
  checkoutUrl: string;
  txRef: string;
};

export type ChapaVerifyResult = {
  status: string;
  amount: number;
  currency: string;
  txRef: string;
  reference: string | null;
};

function baseUrl() {
  return env.CHAPA_BASE_URL?.replace(/\/$/, "") || DEFAULT_BASE;
}

function secret() {
  // Prefer parsed env; allow process.env override so unit tests can inject a key without rebooting.
  const key = env.CHAPA_SECRET_KEY || process.env.CHAPA_SECRET_KEY;
  if (!key) throw new Error("CHAPA_SECRET_KEY is not configured");
  return key;
}

/** Local 09/07 style phone for Chapa (from +251…). */
export function chapaPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("251") && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.length === 10 && (digits.startsWith("09") || digits.startsWith("07"))) return digits;
  return e164;
}

export function chapaEmail(username: string) {
  const local = username.toLowerCase().replace(/[^a-z0-9._-]/g, "") || "user";
  return `${local}@payers.hojiigo.local`;
}

export function makeTxRef(pairingId: string) {
  const short = pairingId.replace(/-/g, "").slice(0, 10);
  return `hg-${short}-${Date.now()}`;
}

async function chapaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
    data?: unknown;
  };
  if (!res.ok || body.status === "failed" || body.status === "error") {
    const msg = body.message || `Chapa request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export async function chapaInitialize(input: {
  amountEtb: number;
  txRef: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  returnUrl: string;
  callbackUrl?: string;
  title: string;
  description: string;
}): Promise<ChapaInitResult> {
  const payload: Record<string, unknown> = {
    amount: String(Math.round(input.amountEtb * 100) / 100),
    currency: "ETB",
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    phone_number: chapaPhone(input.phone),
    tx_ref: input.txRef,
    return_url: input.returnUrl,
    customization: {
      title: input.title.slice(0, 50),
      description: input.description.slice(0, 100),
    },
  };
  if (input.callbackUrl) payload.callback_url = input.callbackUrl;

  const body = await chapaFetch<{ data?: { checkout_url?: string } }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const checkoutUrl = body.data?.checkout_url;
  if (!checkoutUrl) throw new Error("Chapa did not return a checkout URL");
  return { checkoutUrl, txRef: input.txRef };
}

export async function chapaVerify(txRef: string): Promise<ChapaVerifyResult> {
  const body = await chapaFetch<{
    data?: {
      status?: string;
      amount?: string | number;
      currency?: string;
      tx_ref?: string;
      reference?: string;
    };
  }>(`/transaction/verify/${encodeURIComponent(txRef)}`);
  const d = body.data ?? {};
  return {
    status: String(d.status ?? "").toLowerCase(),
    amount: Number(d.amount ?? 0),
    currency: String(d.currency ?? "ETB"),
    txRef: String(d.tx_ref ?? txRef),
    reference: d.reference ? String(d.reference) : null,
  };
}

export async function chapaRefund(txRef: string, input: { amountEtb?: number; reason?: string }) {
  const payload: Record<string, unknown> = {};
  if (input.amountEtb != null) payload.amount = String(input.amountEtb);
  if (input.reason) payload.reason = input.reason;
  await chapaFetch(`/refund/${encodeURIComponent(txRef)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function chapaTransfer(input: {
  accountNumber: string;
  accountName: string;
  amountEtb: number;
  bankCode: number;
  reference: string;
}) {
  const body = await chapaFetch<{ data?: { reference?: string; id?: number | string } }>("/transfers", {
    method: "POST",
    body: JSON.stringify({
      account_number: input.accountNumber,
      account_name: input.accountName,
      amount: String(input.amountEtb),
      currency: "ETB",
      bank_code: input.bankCode,
      reference: input.reference,
    }),
  });
  return {
    reference: body.data?.reference ? String(body.data.reference) : input.reference,
  };
}

/** Verify Chapa webhook signatures (x-chapa-signature or chapa-signature). */
export function verifyChapaWebhookSignature(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>) {
  const key = secret();
  const raw = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const pick = (name: string) => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  const xSig = pick("x-chapa-signature");
  const cSig = pick("chapa-signature");

  const expectedPayload = createHmac("sha256", key).update(raw).digest("hex");
  const expectedKey = createHmac("sha256", key).update(key).digest("hex");

  const ok = (got: string | undefined, expected: string) => {
    if (!got) return false;
    try {
      const a = Buffer.from(got);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  };

  return ok(xSig, expectedPayload) || ok(cSig, expectedKey);
}

export function extractTxRefFromWebhook(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const candidates = [o.tx_ref, o.trx_ref, (o.data as Record<string, unknown> | undefined)?.tx_ref];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

export function isChapaSuccessStatus(status: string) {
  return status === "success" || status === "successful";
}
