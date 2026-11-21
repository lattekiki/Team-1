import type { RequestHandler } from "express";
import { env } from "../env.ts";

export function webOrigins() {
  return env.WEB_ORIGIN.split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function primaryWebOrigin() {
  return webOrigins()[0] ?? "http://localhost:5173";
}

export function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return false;
  const incoming = origin.replace(/\/$/, "");
  return webOrigins().some((allowed) => {
    if (allowed === "https://*.vercel.app") {
      try {
        const url = new URL(incoming);
        return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
      } catch {
        return false;
      }
    }
    return incoming === allowed;
  });
}

/** Allow the frontend origin to call this API with cookies. */
export const corsFromWeb: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin!);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
};
