import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chapaEmail,
  chapaPhone,
  extractTxRefFromWebhook,
  isChapaSuccessStatus,
  makeTxRef,
  verifyChapaWebhookSignature,
} from "../src/lib/chapa.ts";
import { ChapaPaymentProvider } from "../src/lib/payments.ts";

describe("chapa helpers", () => {
  it("normalizes ET phone and builds payer email", () => {
    expect(chapaPhone("+251911234567")).toBe("0911234567");
    expect(chapaEmail("Abebe_Worker")).toBe("abebe_worker@payers.hojiigo.local");
    expect(makeTxRef("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toMatch(/^hg-aaaaaaaabb-\d+$/);
  });

  it("reads tx_ref from webhook payloads", () => {
    expect(extractTxRefFromWebhook({ tx_ref: "hg-1" })).toBe("hg-1");
    expect(extractTxRefFromWebhook({ trx_ref: "hg-2" })).toBe("hg-2");
    expect(extractTxRefFromWebhook({ data: { tx_ref: "hg-3" } })).toBe("hg-3");
    expect(isChapaSuccessStatus("success")).toBe(true);
    expect(isChapaSuccessStatus("failed")).toBe(false);
  });

  it("verifies Chapa webhook signatures", () => {
    const key = "CHASECK_TEST_SECRET";
    const raw = JSON.stringify({ tx_ref: "hg-x", status: "success" });
    const xSig = createHmac("sha256", key).update(raw).digest("hex");
    const cSig = createHmac("sha256", key).update(key).digest("hex");
    process.env.CHAPA_SECRET_KEY = key;
    expect(verifyChapaWebhookSignature(raw, { "x-chapa-signature": xSig })).toBe(true);
    expect(verifyChapaWebhookSignature(raw, { "chapa-signature": cSig })).toBe(true);
    expect(verifyChapaWebhookSignature(raw, { "x-chapa-signature": "deadbeef" })).toBe(false);
  });
});

describe("ChapaPaymentProvider with mocked fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hold returns checkout URL and does not immediate-hold", async () => {
    process.env.CHAPA_SECRET_KEY = "CHASECK_TEST";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "success",
          message: "Hosted Link",
          data: { checkout_url: "https://checkout.chapa.co/pay/test" },
        }),
      ),
    );

    const provider = new ChapaPaymentProvider();
    const result = await provider.hold({
      pairingId: "11111111-2222-3333-4444-555555555555",
      amountEtb: 500,
      employerPhone: "+251911000000",
      employerUsername: "shop_owner",
      jobTitle: "Till shift",
      returnUrl: "http://localhost:5173/pairings/x?payment=return",
    });
    expect(result.checkoutUrl).toBe("https://checkout.chapa.co/pay/test");
    expect(result.immediateHold).toBe(false);
    expect(result.externalId).toMatch(/^hg-/);
    expect(fetch).toHaveBeenCalled();
  });

  it("verifyHold accepts successful matching amounts", async () => {
    process.env.CHAPA_SECRET_KEY = "CHASECK_TEST";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "success",
          data: { status: "success", amount: "500", currency: "ETB", tx_ref: "hg-ref", reference: "APxyz" },
        }),
      ),
    );
    const provider = new ChapaPaymentProvider();
    const ok = await provider.verifyHold({
      pairingId: "11111111-2222-3333-4444-555555555555",
      externalId: "hg-ref",
      expectedAmountEtb: 500,
    });
    expect(ok).toEqual({ ok: true, reference: "APxyz" });
  });
});
