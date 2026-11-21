import { env } from "../env.ts";
import { AppError } from "./errors.ts";

export interface SmsSender {
  readonly name: string;
  send(phone: string, message: string): Promise<void>;
}

class ConsoleSmsSender implements SmsSender {
  readonly name = "console";
  async send(phone: string, message: string) {
    console.log(`[sms] to ${phone}: ${message}`);
  }
}

class AfricasTalkingSmsSender implements SmsSender {
  readonly name = "africastalking";
  constructor(
    private readonly username: string,
    private readonly apiKey: string,
    private readonly from?: string,
  ) {}

  async send(phone: string, message: string) {
    const body = new URLSearchParams({ username: this.username, to: phone, message });
    if (this.from) body.set("from", this.from);
    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        apiKey: this.apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      console.error(`[sms:africastalking] ${res.status} ${await res.text()}`);
      throw new AppError(502, "sms_send_failed", "Could not send SMS.");
    }
  }
}

class TwilioSmsSender implements SmsSender {
  readonly name = "twilio";
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(phone: string, message: string) {
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const body = new URLSearchParams({ To: phone, From: this.from, Body: message });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      console.error(`[sms:twilio] ${res.status} ${await res.text()}`);
      throw new AppError(502, "sms_send_failed", "Could not send SMS.");
    }
  }
}

export function createSmsSender(): SmsSender {
  switch (env.OTP_PROVIDER) {
    case "africastalking":
      return new AfricasTalkingSmsSender(env.AT_USERNAME!, env.AT_API_KEY!, env.AT_FROM || undefined);
    case "twilio":
      return new TwilioSmsSender(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!, env.TWILIO_FROM!);
    default:
      return new ConsoleSmsSender();
  }
}

export const smsSender = createSmsSender();

/** High-signal events that may also go out as SMS when NOTIFY_SMS is enabled. */
export const SMS_NOTIFY_TYPES = new Set([
  "selected",
  "pairing_confirmed",
  "pairing_cancelled",
  "job_cancelled",
  "payment_released",
  "rebook_request",
]);

export function smsBody(type: string, payload: Record<string, unknown>) {
  const title = String(payload.title ?? "a job");
  switch (type) {
    case "selected":
      return `HojiiGO: You were selected for “${title}”. Open the app to confirm.`;
    case "pairing_confirmed":
      return `HojiiGO: Pairing confirmed for “${title}”. Contact is unlocked.`;
    case "pairing_cancelled":
    case "job_cancelled":
      return `HojiiGO: “${title}” was cancelled.`;
    case "payment_released":
      return `HojiiGO: Payment released for “${title}”.`;
    case "rebook_request":
      return `HojiiGO: New rebooking request for “${title}”.`;
    default:
      return `HojiiGO: Update on “${title}”.`;
  }
}
