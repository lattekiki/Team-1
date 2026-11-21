import type { Request } from "express";
import { notFound } from "./errors.ts";

export function idParam(req: Request, name = "id"): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value) throw notFound();
  return value;
}
