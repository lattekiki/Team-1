import cookieParser from "cookie-parser";
import express from "express";
import { pool } from "./db/pool.ts";
import { loadUser } from "./lib/auth.ts";
import { errorHandler, notFoundHandler } from "./lib/errors.ts";
import { adminRouter } from "./modules/admin.ts";
import { applicationsRouter } from "./modules/applications.ts";
import { authRouter } from "./modules/auth.ts";
import { inquiriesRouter } from "./modules/inquiries.ts";
import { jobsRouter } from "./modules/jobs.ts";
import { pairingsRouter } from "./modules/pairings.ts";
import { paymentsRouter } from "./modules/payments.ts";
import { profilesRouter } from "./modules/profiles.ts";
import { safetyRouter } from "./modules/safety.ts";
import { ticketsRouter } from "./modules/tickets.ts";
import { assistRouter } from "./modules/assist.ts";
import { paymentsConfig } from "./lib/payments.ts";
import { assistConfig } from "./lib/llm.ts";
import { otpProvider } from "./lib/otp.ts";
import { objectStore } from "./lib/storage.ts";
import { pushConfigured } from "./lib/push.ts";
import { vipCategoriesEnabled } from "./lib/pilot.ts";
import { env } from "./env.ts";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.use(
    express.json({
      limit: "100kb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());

  const api = express.Router();

  api.get("/health", async (_req, res) => {
    let db = "ok";
    try {
      await pool.query("select 1");
    } catch {
      db = "unreachable";
    }
    res.status(db === "ok" ? 200 : 503).json({
      status: db === "ok" ? "ok" : "degraded",
      db,
      otpProvider: otpProvider.name,
      payments: paymentsConfig(),
      storage: objectStore.name,
      push: pushConfigured,
      notifySms: Boolean(env.NOTIFY_SMS),
      assist: assistConfig(),
      vipCategories: vipCategoriesEnabled,
    });
  });

  // Webhooks / config before session auth (signature-checked where needed).
  api.use(paymentsRouter);

  api.use(loadUser);
  api.use(authRouter);
  api.use(profilesRouter);
  api.use(inquiriesRouter);
  api.use(jobsRouter);
  api.use(assistRouter);
  api.use(applicationsRouter);
  api.use(pairingsRouter);
  api.use(safetyRouter);
  api.use(ticketsRouter);
  api.use(adminRouter);

  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
