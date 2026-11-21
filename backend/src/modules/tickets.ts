import { Router } from "express";
import {
  ticketCreateSchema,
  ticketMessageSchema,
  ticketResolveSchema,
  type SupportTicket,
  type SupportTicketMessage,
  type SupportTicketSummary,
} from "@team1/shared";
import { pool, withTransaction, type Db } from "../db/pool.ts";
import { currentUser, requireAuth, requireRole, type AuthUser } from "../lib/auth.ts";
import { idParam } from "../lib/http.ts";
import { conflict, forbidden, notFound } from "../lib/errors.ts";
import { audit, notify } from "../lib/events.ts";

export const ticketsRouter = Router();

const staff = requireRole("admin", "support");
const OPEN: string[] = ["open", "waiting_staff", "waiting_user"];

type TicketRow = Record<string, any>;

function isStaffRole(role: string) {
  return role === "admin" || role === "support";
}

function toSummary(r: TicketRow): SupportTicketSummary {
  return {
    id: r.id,
    subject: r.subject,
    category: r.category,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    username: r.username ?? undefined,
    messageCount: Number(r.message_count ?? 0),
    lastMessagePreview: r.last_message_preview ?? null,
  };
}

function toMessage(r: TicketRow, viewerId: string): SupportTicketMessage {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    author: {
      username: r.username,
      isStaff: isStaffRole(r.role),
      isMe: r.author_id === viewerId,
    },
  };
}

async function loadTicket(db: Db, id: string, lock = false) {
  if (lock) await db.query("select 1 from support_tickets where id = $1 for update", [id]);
  const { rows } = await db.query(
    `select t.*, u.username, u.role as owner_role
     from support_tickets t join users u on u.id = t.user_id
     where t.id = $1`,
    [id],
  );
  return rows[0] as TicketRow | undefined;
}

async function messagesFor(db: Db, ticketId: string, viewerId: string) {
  const { rows } = await db.query(
    `select m.*, u.username, u.role
     from support_ticket_messages m join users u on u.id = m.author_id
     where m.ticket_id = $1 order by m.created_at`,
    [ticketId],
  );
  return rows.map((r) => toMessage(r, viewerId));
}

async function assertCanView(ticket: TicketRow, me: AuthUser) {
  if (ticket.user_id !== me.id && !isStaffRole(me.role)) throw notFound("Ticket not found");
}

async function respondTicket(res: import("express").Response, id: string, me: AuthUser) {
  const ticket = await loadTicket(pool, id);
  if (!ticket) throw notFound("Ticket not found");
  await assertCanView(ticket, me);
  const detail: SupportTicket = {
    ...toSummary({ ...ticket, message_count: 0, last_message_preview: null }),
    username: ticket.username,
    messages: await messagesFor(pool, id, me.id),
  };
  detail.messageCount = detail.messages.length;
  detail.lastMessagePreview = detail.messages.at(-1)?.body.slice(0, 120) ?? null;
  res.json({ ticket: detail });
}

const LIST_SELECT = `
  select t.*, u.username,
         (select count(*)::int from support_ticket_messages m where m.ticket_id = t.id) as message_count,
         (select left(m.body, 120) from support_ticket_messages m
          where m.ticket_id = t.id order by m.created_at desc limit 1) as last_message_preview
  from support_tickets t
  join users u on u.id = t.user_id`;

ticketsRouter.post("/tickets", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = ticketCreateSchema.parse(req.body);
  const id = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `insert into support_tickets (user_id, subject, category, status)
       values ($1, $2, $3, 'waiting_staff') returning id`,
      [me.id, body.subject, body.category],
    );
    const ticketId = rows[0].id as string;
    await db.query("insert into support_ticket_messages (ticket_id, author_id, body) values ($1, $2, $3)", [
      ticketId,
      me.id,
      body.body,
    ]);
    return ticketId;
  });
  res.status(201);
  await respondTicket(res, id, me);
});

ticketsRouter.get("/me/tickets", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const { rows } = await pool.query(`${LIST_SELECT} where t.user_id = $1 order by t.updated_at desc limit 50`, [
    me.id,
  ]);
  res.json({ tickets: rows.map(toSummary) });
});

ticketsRouter.get("/tickets/:id", requireAuth, async (req, res) => {
  await respondTicket(res, idParam(req), currentUser(req));
});

ticketsRouter.post("/tickets/:id/messages", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = ticketMessageSchema.parse(req.body);
  await withTransaction(async (db) => {
    const ticket = await loadTicket(db, idParam(req), true);
    if (!ticket) throw notFound("Ticket not found");
    await assertCanView(ticket, me);
    if (!OPEN.includes(ticket.status)) {
      throw conflict("This ticket is closed; open a new one if you need more help", "ticket_closed");
    }

    const staffAuthor = isStaffRole(me.role);
    if (!staffAuthor && ticket.user_id !== me.id) throw forbidden();

    await db.query("insert into support_ticket_messages (ticket_id, author_id, body) values ($1, $2, $3)", [
      ticket.id,
      me.id,
      body.body,
    ]);
    const nextStatus = staffAuthor ? "waiting_user" : "waiting_staff";
    await db.query("update support_tickets set status = $2, updated_at = now() where id = $1", [
      ticket.id,
      nextStatus,
    ]);

    if (staffAuthor && ticket.user_id !== me.id) {
      await notify(db, ticket.user_id, "ticket_reply", {
        ticketId: ticket.id,
        subject: ticket.subject,
      });
    }
  });
  await respondTicket(res, idParam(req), me);
});

ticketsRouter.post("/tickets/:id/close", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const ticket = await loadTicket(db, idParam(req), true);
    if (!ticket) throw notFound("Ticket not found");
    if (ticket.user_id !== me.id) throw forbidden("Only the ticket owner can close it this way");
    if (ticket.status === "closed") throw conflict("Ticket already closed", "ticket_closed");
    await db.query(
      `update support_tickets set status = 'closed', resolved_at = coalesce(resolved_at, now()),
         updated_at = now() where id = $1`,
      [ticket.id],
    );
  });
  await respondTicket(res, idParam(req), me);
});

ticketsRouter.get("/admin/tickets", staff, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const { rows } = await pool.query(
    `${LIST_SELECT}
     where ($1::text is null or t.status = $1)
     order by (t.status in ('open', 'waiting_staff', 'waiting_user')) desc, t.updated_at desc
     limit 100`,
    [status],
  );
  res.json({ tickets: rows.map(toSummary) });
});

ticketsRouter.post("/admin/tickets/:id/resolve", staff, async (req, res) => {
  const me = currentUser(req);
  const body = ticketResolveSchema.parse(req.body);
  await withTransaction(async (db) => {
    const ticket = await loadTicket(db, idParam(req), true);
    if (!ticket) throw notFound("Ticket not found");
    if (!OPEN.includes(ticket.status) && ticket.status !== "resolved") {
      throw conflict("Ticket already closed", "ticket_closed");
    }
    if (body.note?.trim()) {
      await db.query("insert into support_ticket_messages (ticket_id, author_id, body) values ($1, $2, $3)", [
        ticket.id,
        me.id,
        body.note.trim(),
      ]);
    }
    await db.query(
      `update support_tickets set status = $2, resolved_by = $3, resolved_at = now(), updated_at = now()
       where id = $1`,
      [ticket.id, body.status, me.id],
    );
    await audit(db, me.id, "ticket.resolve", { type: "ticket", id: ticket.id }, body);
    await notify(db, ticket.user_id, "ticket_updated", {
      ticketId: ticket.id,
      subject: ticket.subject,
      status: body.status,
    });
  });
  await respondTicket(res, idParam(req), me);
});
