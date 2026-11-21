import { env } from "../env.ts";
import { smsSender } from "./sms.ts";

export interface OtpProvider {
  readonly name: string;
  send(phone: string, code: string): Promise<void>;
}

/** Sends OTP codes through the shared SMS sender (console / Africa's Talking / Twilio). */
export class SmsOtpProvider implements OtpProvider {
  readonly name = smsSender.name;
  async send(phone: string, code: string) {
    await smsSender.send(phone, `HojiiGO code: ${code}. Valid 5 minutes. Do not share it.`);
  }
}

export function createOtpProvider(): OtpProvider {
  return new SmsOtpProvider();
}

export const otpProvider = createOtpProvider();

/** Only expose the code in API responses when using the console provider (or explicit override). */
export const otpExposeDevCode =
  env.OTP_EXPOSE_DEV_CODE === true || (env.OTP_PROVIDER === "console" && env.NODE_ENV !== "production");
