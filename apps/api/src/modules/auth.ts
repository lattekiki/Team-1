import { randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { otpRequestSchema, otpVerifySchema, type Me } from "@team1/shared";
import { pool, withTransaction } from "../db/pool.ts";
import { env, isProd } from "../env.ts";
import { createSession, currentUser, destroySession, requireAuth, SESSION_COOKIE, sha256 } from "../lib/auth.ts";
import { AppError, badRequest, conflict } from "../lib/errors.ts";
import { otpProvider } from "../lib/otp.ts";
import { reputationFor } from "../lib/stats.ts";

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_WINDOW = 3;

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_req, res) => {
    res.status(429).json({ error: { code: "rate_limited", message: "Too many attempts. Try again later." } });
  },
});

const hashCode = (phone: string, code: string) => sha256(`${phone}:${code}`);

export async function loadMe(userId: string): Promise<Me> {
  const { rows } = await pool.query(
    `select id, phone, username, language, role, active_mode, identity_verified, high_trust_approved
     from users where id = $1`,
    [userId],
  );
  const u = rows[0];
  const rep = (await reputationFor(pool, [userId])).get(userId);
  return {
    id: u.id,
    phone: u.phone,
    username: u.username,
    language: u.language,
    role: u.role,
    activeMode: u.active_mode,
    identityVerified: u.identity_verified,
    highTrustApproved: u.high_trust_approved,
    rating: rep?.rating ?? null,
    reviewCount: rep?.reviewCount ?? 0,
    completedJobs: rep?.completedJobs ?? 0,
  };
}

export const authRouter = Router();

authRouter.post("/auth/otp/request", otpLimiter, async (req, res) => {
  const { phone } = otpRequestSchema.parse(req.body);
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from otp_codes where phone = $1 and created_at > now() - interval '10 minutes'",
    [phone],
  );
  if ((rows[0]?.n ?? 0) >= OTP_MAX_PER_WINDOW) {
    throw new AppError(429, "rate_limited", "Too many codes requested. Wait a few minutes and try again.");
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await pool.query("insert into otp_codes (phone, code_hash, expires_at) values ($1, $2, $3)", [
    phone,
    hashCode(phone, code),
    new Date(Date.now() + OTP_TTL_MS),
  ]);
  await otpProvider.send(phone, code);
  const existing = await pool.query("select 1 from users where phone = $1", [phone]);
  res.json({ sent: true, isNewUser: existing.rowCount === 0, ...(isProd ? {} : { devCode: code }) });
});

authRouter.post("/auth/otp/verify", otpLimiter, async (req, res) => {
  const { phone, code, username, language } = otpVerifySchema.parse(req.body);

  const outcome = await withTransaction(async (db): Promise<{ userId: string } | { invalidCode: true }> => {
    const { rows } = await db.query(
      `select id, code_hash, attempts from otp_codes
       where phone = $1 and consumed_at is null and expires_at > now()
       order by created_at desc limit 1 for update`,
      [phone],
    );
    const otp = rows[0];
    if (!otp) throw badRequest("Code expired. Request a new one.");
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw badRequest("Too many wrong attempts. Request a new code.");

    const expected = Buffer.from(otp.code_hash, "hex");
    const actual = Buffer.from(hashCode(phone, code), "hex");
    if (!timingSafeEqual(expected, actual)) {
      await db.query("update otp_codes set attempts = attempts + 1 where id = $1", [otp.id]);
      return { invalidCode: true };
    }

    const existing = await db.query("select id, status from users where phone = $1", [phone]);
    let user = existing.rows[0];
    if (user?.status === "suspended") throw new AppError(403, "suspended", "This account is suspended");

    if (!user) {
      if (!username) {
        // Keep the code valid so the client can resubmit with a username.
        throw new AppError(422, "username_required", "Choose a public username to finish signing up");
      }
      const taken = await db.query("select 1 from users where lower(username) = lower($1)", [username]);
      if (taken.rowCount) throw conflict("That username is taken");
      const created = await db.query(
        "insert into users (phone, username, language) values ($1, $2, $3) returning id",
        [phone, username, language ?? "en"],
      );
      user = created.rows[0];
      await db.query("insert into worker_profiles (user_id) values ($1)", [user.id]);
      await db.query("insert into employer_profiles (user_id) values ($1)", [user.id]);
    }

    await db.query("update otp_codes set consumed_at = now() where id = $1", [otp.id]);
    await createSession(db, res, user.id);
    return { userId: user.id as string };
  });

  if ("invalidCode" in outcome) throw new AppError(400, "invalid_code", "That code is not correct");
  res.json({ user: await loadMe(outcome.userId) });
});

authRouter.post("/auth/logout", async (req, res) => {
  await destroySession(req.cookies?.[SESSION_COOKIE], res);
  res.status(204).end();
});

authRouter.get("/auth/me", requireAuth, async (req, res) => {
  res.json({ user: await loadMe(currentUser(req).id) });
});
