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
    /** Force returning the code in /auth/otp/request (never enable with a live SMS provider in production). */
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
     * chapa — licensed Chapa hosted checkout + refund/transfer (needs CHAPA_SECRET_KEY).
     */
    PAYMENTS_MODE: z.enum(["off", "manual", "mock_escrow", "chapa"]).default("off"),
    CHAPA_SECRET_KEY: z.string().optional(),
    CHAPA_PUBLIC_KEY: z.string().optional(),
    /** Override API host (tests / sandbox proxies). Default https://api.chapa.co/v1 */
    CHAPA_BASE_URL: z.string().url().optional(),
    /** Public API origin for Chapa callback/webhook (e.g. https://api.example.com). */
    PUBLIC_API_URL: z.string().url().optional(),

    /** local (default disk) | s3 (AWS S3 / R2 / MinIO compatible) */
    STORAGE_BACKEND: z.enum(["local", "s3"]).default("local"),
    UPLOAD_DIR: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    /** Optional custom endpoint for R2/MinIO (e.g. https://xxx.r2.cloudflarestorage.com). */
    S3_ENDPOINT: z.string().url().optional(),

    /** Web Push (optional). Generate with: npx web-push generate-vapid-keys */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default("mailto:pilot@hojiigo.local"),
    /** Also SMS high-priority alerts via OTP_PROVIDER (console logs when console). */
    NOTIFY_SMS: boolish,
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
    if (
      e.STORAGE_BACKEND === "s3" &&
      (!e.S3_BUCKET || !e.S3_REGION || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required when STORAGE_BACKEND=s3",
        path: ["S3_BUCKET"],
      });
    }
    if (e.PAYMENTS_MODE === "chapa" && !e.CHAPA_SECRET_KEY) {
      ctx.addIssue({
        code: "custom",
        message: "CHAPA_SECRET_KEY is required when PAYMENTS_MODE=chapa",
        path: ["CHAPA_SECRET_KEY"],
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
