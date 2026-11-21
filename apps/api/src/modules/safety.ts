import { Router } from "express";
import {
  reportCreateSchema,
  verificationCreateSchema,
  type BlockedUser,
  type Notification,
  type VerificationDocument,
  type VerificationRecord,
} from "@team1/shared";
import { pool, withTransaction, type Db } from "../db/pool.ts";
import { currentUser, requireAuth, type AuthUser } from "../lib/auth.ts";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.ts";
import { idParam } from "../lib/http.ts";
import { LocalObjectStore, objectStore, type ObjectStore } from "../lib/storage.ts";
import {
  MAX_VERIFICATION_DOCS,
  safeDeleteObject,
  storeVerificationFile,
  verificationUpload,
} from "../lib/uploads.ts";

const localStore = new LocalObjectStore();

function storeForBackend(backend: string): ObjectStore {
  if (backend === "s3") {
    if (objectStore.name !== "s3") {
      throw badRequest("This file is in cloud storage but STORAGE_BACKEND is not s3", "storage_unavailable");
    }
    return objectStore;
  }
  return localStore;
}

export const safetyRouter = Router();

safetyRouter.post("/reports", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = reportCreateSchema.parse(req.body);
  const { rows } = await pool.query(
    "insert into reports (reporter_id, target_type, target_id, reason) values ($1, $2, $3, $4) returning id",
    [me.id, body.targetType, body.targetId, body.reason],
  );
  res.status(201).json({ report: { id: rows[0].id, status: "open" } });
});

function toDoc(r: Record<string, any>): VerificationDocument {
  return {
    id: r.id,
    originalName: r.original_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  };
}

async function docsFor(db: Db, verificationIds: string[]): Promise<Map<string, VerificationDocument[]>> {
  const map = new Map<string, VerificationDocument[]>();
  if (!verificationIds.length) return map;
  const { rows } = await db.query(
    `select * from verification_documents where verification_id = any($1::uuid[]) order by created_at`,
    [verificationIds],
  );
  for (const r of rows) {
    const list = map.get(r.verification_id) ?? [];
    list.push(toDoc(r));
    map.set(r.verification_id, list);
  }
  return map;
}

const toVerification = (r: Record<string, any>, documents: VerificationDocument[] = []): VerificationRecord => ({
  id: r.id,
  kind: r.kind,
  note: r.note,
  status: r.status,
  reviewNote: r.review_note,
  createdAt: r.created_at,
  reviewedAt: r.reviewed_at,
  documents,
});

function isStaff(user: AuthUser) {
  return user.role === "admin" || user.role === "support";
}

async function loadVerificationAccess(id: string, me: AuthUser) {
  const { rows } = await pool.query("select * from verification_records where id = $1", [id]);
  const rec = rows[0];
  if (!rec) throw notFound("Verification request not found");
  if (rec.user_id !== me.id && !isStaff(me)) throw notFound("Verification request not found");
  return rec as Record<string, any>;
}

safetyRouter.get("/me/verification", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const { rows } = await pool.query(
    "select * from verification_records where user_id = $1 order by created_at desc",
    [me.id],
  );
  const docs = await docsFor(
    pool,
    rows.map((r) => r.id),
  );
  res.json({ records: rows.map((r) => toVerification(r, docs.get(r.id) ?? [])) });
});

safetyRouter.post("/verification", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = verificationCreateSchema.parse(req.body);
  const pending = await pool.query(
    "select 1 from verification_records where user_id = $1 and kind = $2 and status = 'pending'",
    [me.id, body.kind],
  );
  if (pending.rowCount) throw conflict("You already have a pending request of this type", "verification_pending");
  const { rows } = await pool.query(
    "insert into verification_records (user_id, kind, note) values ($1, $2, $3) returning *",
    [me.id, body.kind, body.note],
  );
  res.status(201).json({ record: toVerification(rows[0], []) });
});

safetyRouter.post(
  "/verification/:id/documents",
  requireAuth,
  verificationUpload.single("file"),
  async (req, res) => {
    const me = currentUser(req);
    const file = req.file;
    if (!file) throw badRequest("Choose a file to upload", "file_required");

    const stored = await storeVerificationFile(file);
    try {
      const record = await withTransaction(async (db) => {
        const { rows } = await db.query("select * from verification_records where id = $1 for update", [
          idParam(req),
        ]);
        const rec = rows[0];
        if (!rec) throw notFound("Verification request not found");
        if (rec.user_id !== me.id) throw forbidden("Only the requester can attach documents");
        if (rec.status !== "pending") {
          throw conflict("Documents can only be added while the request is pending", "verification_not_pending");
        }
        const count = await db.query(
          "select count(*)::int as n from verification_documents where verification_id = $1",
          [rec.id],
        );
        if (count.rows[0].n >= MAX_VERIFICATION_DOCS) {
          throw conflict(`You can attach up to ${MAX_VERIFICATION_DOCS} files`, "too_many_documents");
        }
        const inserted = await db.query(
          `insert into verification_documents
             (verification_id, original_name, stored_name, mime_type, size_bytes, uploaded_by, storage_backend)
           values ($1, $2, $3, $4, $5, $6, $7) returning *`,
          [
            rec.id,
            file.originalname.slice(0, 200),
            stored.key,
            file.mimetype,
            stored.size,
            me.id,
            stored.backend,
          ],
        );
        const all = await docsFor(db, [rec.id]);
        return toVerification(rec, all.get(rec.id) ?? [toDoc(inserted.rows[0])]);
      });
      res.status(201).json({ record });
    } catch (err) {
      await safeDeleteObject(stored.key);
      throw err;
    }
  },
);

safetyRouter.get("/verification/:id/documents/:docId/file", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const rec = await loadVerificationAccess(idParam(req), me);
  const { rows } = await pool.query(
    "select * from verification_documents where id = $1 and verification_id = $2",
    [req.params.docId, rec.id],
  );
  const doc = rows[0];
  if (!doc) throw notFound("Document not found");
  res.setHeader("Content-Type", doc.mime_type);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${String(doc.original_name).replace(/"/g, "")}"`,
  );
  const stream = await storeForBackend(doc.storage_backend ?? "local").get(doc.stored_name);
  stream.pipe(res);
});

async function userByUsername(name: string | string[] | undefined) {
  const { rows } = await pool.query("select id, username from users where lower(username) = lower($1)", [
    typeof name === "string" ? name : "",
  ]);
  if (!rows[0]) throw notFound("User not found");
  return rows[0] as { id: string; username: string };
}

safetyRouter.get("/me/blocks", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const { rows } = await pool.query(
    `select u.username, b.created_at from user_blocks b join users u on u.id = b.blocked_id
     where b.blocker_id = $1 order by b.created_at desc`,
    [me.id],
  );
  const blocks: BlockedUser[] = rows.map((r) => ({ username: r.username, createdAt: r.created_at }));
  res.json({ blocks });
});

safetyRouter.post("/users/:username/block", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const target = await userByUsername(req.params.username);
  if (target.id === me.id) throw badRequest("You cannot block yourself", "cannot_block_self");
  await withTransaction(async (db) => {
    await db.query("insert into user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing", [
      me.id,
      target.id,
    ]);
    // Open applications between the two stop here; existing pairings are untouched (use cancel or report).
    await db.query(
      `update applications a set status = case when a.worker_id = $1 then 'withdrawn' else 'rejected' end, updated_at = now()
       from jobs j
       where a.job_id = j.id and a.status = 'pending'
         and ((a.worker_id = $1 and j.employer_id = $2) or (a.worker_id = $2 and j.employer_id = $1))`,
      [me.id, target.id],
    );
  });
  res.status(204).end();
});

safetyRouter.delete("/users/:username/block", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const target = await userByUsername(req.params.username);
  await pool.query("delete from user_blocks where blocker_id = $1 and blocked_id = $2", [me.id, target.id]);
  res.status(204).end();
});

safetyRouter.get("/notifications", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const [list, unread] = await Promise.all([
    pool.query(
      "select id, type, payload, read_at, created_at from notifications where user_id = $1 order by created_at desc limit 50",
      [me.id],
    ),
    pool.query("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [me.id]),
  ]);
  const notifications: Notification[] = list.rows.map((n) => ({
    id: n.id,
    type: n.type,
    payload: n.payload,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
  res.json({ notifications, unread: unread.rows[0].n });
});

safetyRouter.post("/notifications/read", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await pool.query("update notifications set read_at = now() where user_id = $1 and read_at is null", [me.id]);
  res.status(204).end();
});
