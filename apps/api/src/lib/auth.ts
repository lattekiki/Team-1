import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler, Response } from "express";
import type { Mode, Role } from "@team1/shared";
import { pool, type Db } from "../db/pool.ts";
import { isProd } from "../env.ts";
import { forbidden, unauthorized } from "./errors.ts";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 30;

export type AuthUser = {
  id: string;
  phone: string;
  username: string | null;
  language: string;
  role: Role;
  activeMode: Mode;
  identityVerified: boolean;
  highTrustApproved: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createSession(db: Db, res: Response, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.query("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)", [
    sha256(token),
    userId,
    expires,
  ]);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    expires,
    path: "/",
  });
}

export async function destroySession(token: string | undefined, res: Response) {
  if (token) await pool.query("delete from sessions where token_hash = $1", [sha256(token)]);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export const loadUser: RequestHandler = async (req, _res, next) => {
  const token: string | undefined = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  const { rows } = await pool.query(
    `select u.id, u.phone, u.username, u.language, u.role, u.active_mode,
            u.identity_verified, u.high_trust_approved
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.status = 'active'`,
    [sha256(token)],
  );
  const u = rows[0];
  if (u) {
    req.user = {
      id: u.id,
      phone: u.phone,
      username: u.username,
      language: u.language,
      role: u.role,
      activeMode: u.active_mode,
      identityVerified: u.identity_verified,
      highTrustApproved: u.high_trust_approved,
    };
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
