import { env } from "../env.ts";
import { AppError } from "./errors.ts";

export interface OtpProvider {
  readonly name: string;
  send(phone: string, code: string): Promise<void>;
}

/** Dev / test stand-in — logs the code; never use as the only prod channel without knowing the risk. */
export class ConsoleOtpProvider implements OtpProvider {
  readonly name = "console";
  async send(phone: string, code: string) {
    console.log(`[otp] code for ${phone}: ${code}`);
  }
}

/** Africa's Talking SMS (common for East Africa). https://developers.africastalking.com/docs/sms/sending */
export class AfricasTalkingOtpProvider implements OtpProvider {
  readonly name = "africastalking";
  constructor(
    private readonly username: string,
    private readonly apiKey: string,
    private readonly from?: string,
  ) {}

  async send(phone: string, code: string) {
    const body = new URLSearchParams({
      username: this.username,
      to: phone,
      message: `HojiiGO code: ${code}. Valid 5 minutes. Do not share it.`,
    });
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
    const text = await res.text();
    if (!res.ok) {
      console.error(`[otp:africastalking] ${res.status} ${text}`);
      throw new AppError(502, "otp_send_failed", "Could not send SMS. Try again in a moment.");
    }
  }
}

/** Twilio Programmable Messaging. */
export class TwilioOtpProvider implements OtpProvider {
  readonly name = "twilio";
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(phone: string, code: string) {
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const body = new URLSearchParams({
      To: phone,
      From: this.from,
      Body: `HojiiGO code: ${code}. Valid 5 minutes. Do not share it.`,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    const text = await res.text();
    if (!res.ok) {
      console.error(`[otp:twilio] ${res.status} ${text}`);
      throw new AppError(502, "otp_send_failed", "Could not send SMS. Try again in a moment.");
    }
  }
}

export function createOtpProvider(): OtpProvider {
  switch (env.OTP_PROVIDER) {
    case "africastalking": {
      if (!env.AT_USERNAME || !env.AT_API_KEY) {
        throw new Error("OTP_PROVIDER=africastalking requires AT_USERNAME and AT_API_KEY");
      }
      return new AfricasTalkingOtpProvider(env.AT_USERNAME, env.AT_API_KEY, env.AT_FROM || undefined);
    }
    case "twilio": {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) {
        throw new Error("OTP_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM");
      }
      return new TwilioOtpProvider(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM);
    }
    default:
      return new ConsoleOtpProvider();
  }
}

export const otpProvider = createOtpProvider();

/** Only expose the code in API responses when using the console provider (or explicit override). */
export const otpExposeDevCode =
  env.OTP_EXPOSE_DEV_CODE === true || (env.OTP_PROVIDER === "console" && env.NODE_ENV !== "production");
