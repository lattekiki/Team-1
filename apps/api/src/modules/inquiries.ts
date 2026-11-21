import { Router } from "express";
import { INQUIRY_STATUSES, ORG_MONTHLY_ETB, inquiryCreateSchema, inquiryStatusSchema } from "@team1/shared";
import { pool } from "../db/pool.ts";
import { currentUser, requireRole } from "../lib/auth.ts";
import { idParam } from "../lib/http.ts";
import { audit } from "../lib/events.ts";
import { notFound } from "../lib/errors.ts";

export const inquiriesRouter = Router();

inquiriesRouter.get("/inquiries/config", (_req, res) => {
  res.json({ monthlyEtb: ORG_MONTHLY_ETB });
});

inquiriesRouter.post("/inquiries", async (req, res) => {
  const body = inquiryCreateSchema.parse(req.body);
  const { rows } = await pool.query(
    `insert into organization_inquiries
       (organization_name, contact_name, phone, email, message, workers_needed, monthly_etb)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, status, created_at`,
    [body.organizationName, body.contactName, body.phone, body.email, body.message, body.workersNeeded, ORG_MONTHLY_ETB],
  );
  res.status(201).json({ inquiry: { id: rows[0].id, status: rows[0].status, createdAt: rows[0].created_at } });
});

inquiriesRouter.get("/admin/inquiries", requireRole("admin", "support"), async (_req, res) => {
  const { rows } = await pool.query(
    `select * from organization_inquiries order by (status = 'new') desc, created_at desc limit 100`,
  );
  res.json({
    inquiries: rows.map((r) => ({
      id: r.id,
      organizationName: r.organization_name,
      contactName: r.contact_name,
      phone: r.phone,
      email: r.email,
      message: r.message,
      workersNeeded: r.workers_needed,
      monthlyEtb: r.monthly_etb,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
});

inquiriesRouter.post("/admin/inquiries/:id/status", requireRole("admin"), async (req, res) => {
  const body = inquiryStatusSchema.parse(req.body);
  if (!(INQUIRY_STATUSES as readonly string[]).includes(body.status)) {
    throw notFound("Inquiry not found");
  }
  const { rows } = await pool.query(
    `update organization_inquiries set status = $2, updated_at = now() where id = $1 returning id`,
    [idParam(req), body.status],
  );
  if (!rows[0]) throw notFound("Inquiry not found");
  await audit(pool, currentUser(req).id, "inquiry.status", { type: "organization_inquiry", id: rows[0].id }, body);
  res.json({ ok: true });
});
