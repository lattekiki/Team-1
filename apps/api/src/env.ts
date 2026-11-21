import { z } from "zod";

const boolish = z
  .string()
  .optional()
  .transform((v) => v === "1" || v?.toLowerCase() === "true");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url("DATABASE_URL must be a postgres:// URL (copy apps/api/.env.example to apps/api/.env)"),
    TEST_DATABASE_URL: z.string().url().optional(),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),

    /** console (default) | africastalking | twilio */
    OTP_PROVIDER: z.enum(["console", "africastalking", "twilio"]).default("console"),
    /** Force returning the code in /auth/otp/request (never enable in real SMS prod). */
    OTP_EXPOSE_DEV_CODE: boolish,
    AT_USERNAME: z.string().optional(),
    AT_API_KEY: z.string().optional(),
    AT_FROM: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM: z.string().optional(),

    /**
     * off (default) — payment_status stays not_required.
     * manual — parties record hold/paid/refund; no money through the platform.
     * mock_escrow — simulated hold/release ledger for UX; still no real money.
     */
    PAYMENTS_MODE: z.enum(["off", "manual", "mock_escrow"]).default("off"),
  })
  .superRefine((e, ctx) => {
    if (e.OTP_PROVIDER === "africastalking" && (!e.AT_USERNAME || !e.AT_API_KEY)) {
      ctx.addIssue({
        code: "custom",
        message: "AT_USERNAME and AT_API_KEY are required when OTP_PROVIDER=africastalking",
        path: ["AT_API_KEY"],
      });
    }
    if (e.OTP_PROVIDER === "twilio" && (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN || !e.TWILIO_FROM)) {
      ctx.addIssue({
        code: "custom",
        message: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM are required when OTP_PROVIDER=twilio",
        path: ["TWILIO_AUTH_TOKEN"],
      });
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
