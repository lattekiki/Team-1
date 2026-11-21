import { env } from "../env.ts";

/** Render (and other hosted Postgres) require TLS; local Docker does not. */
export function pgSsl(url: string): { rejectUnauthorized: boolean } | undefined {
  if (env.NODE_ENV === "test") return undefined;
  if (env.NODE_ENV === "production" || /sslmode=require|[?&]ssl=/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}
