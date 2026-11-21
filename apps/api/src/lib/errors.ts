import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError, z } from "zod";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// `code` is stable and translated by the web client; `message` is the English fallback.
export const badRequest = (message: string, code = "bad_request") => new AppError(400, code, message);
export const unauthorized = (message = "Sign in required") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this", code = "forbidden") => new AppError(403, code, message);
export const notFound = (message = "Not found") => new AppError(404, "not_found", message);
export const conflict = (message: string, code = "conflict") => new AppError(409, code, message);

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound("Route not found"));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "validation_error", message: "Some fields are invalid", details: z.flattenError(err).fieldErrors },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // Postgres error codes: unique violation, malformed uuid/number, check constraint.
  if (err?.code === "23505") {
    res.status(409).json({ error: { code: "conflict", message: "That already exists" } });
    return;
  }
  if (err?.code === "22P02") {
    res.status(404).json({ error: { code: "not_found", message: "Not found" } });
    return;
  }
  if (err?.code === "23514") {
    res.status(400).json({ error: { code: "bad_request", message: "Some values are out of range" } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal", message: "Something went wrong" } });
};
