import { Router } from "express";
import {
  coordsForArea,
  jobBulkCreateSchema,
  jobCreateSchema,
  jobQuerySchema,
  jobUpdateSchema,
  type JobSummary,
  type JobWhen,
} from "@team1/shared";
import { pool, withTransaction, type Db } from "../db/pool.ts";
import { currentUser, requireAuth } from "../lib/auth.ts";
import { notBlockedSql } from "../lib/blocks.ts";
import { idParam } from "../lib/http.ts";
import { evaluateEligibility, loadWorkerTrust, type WorkerTrust } from "../lib/eligibility.ts";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.ts";
import { notify } from "../lib/events.ts";

const JOB_SELECT = `
  select j.*, c.slug as category_slug, c.name as category_name,
         u.username as employer_username, ep.employer_type, ep.business_name,
         (select count(*) from applications a where a.job_id = j.id and a.status <> 'withdrawn')::int as application_count,
         (select count(*) from pairings p
           where p.job_id = j.id
             and p.status in ('pending_confirmation', 'confirmed', 'in_progress', 'completed'))::int as filled_slots,
         ma.id as my_application_id, ma.status as my_application_status,
         exists(select 1 from job_favorites f where f.job_id = j.id and f.user_id = $1::uuid) as saved
  from jobs j
  join job_categories c on c.id = j.category_id
  join users u on u.id = j.employer_id
  left join employer_profiles ep on ep.user_id = j.employer_id
  left join applications ma on ma.job_id = j.id and ma.worker_id = $1::uuid`;

// Midnight today on Jimma's clock; "today" means the local day, not the server's.
const JIMMA_TODAY = `(date_trunc('day', now() at time zone 'Africa/Addis_Ababa') at time zone 'Africa/Addis_Ababa')`;
const WHEN_DAYS: Record<JobWhen, [from: number, to: number]> = { today: [0, 1], tomorrow: [1, 2], week: [0, 7] };

type JobRow = Record<string, any>;

export function toJobSummary(r: JobRow, viewerId: string | null, trust: WorkerTrust | null): JobSummary {
  const isOwner = viewerId === r.employer_id;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    tier: r.tier,
    category: { id: r.category_id, slug: r.category_slug, name: r.category_name },
    employer: {
      username: r.employer_username,
      employerType: r.employer_type ?? "individual",
      businessName: r.business_name ?? null,
    },
    area: r.area,
    landmark: r.landmark,
    lat: r.lat != null ? Number(r.lat) : (coordsForArea(r.area)?.lat ?? null),
    lng: r.lng != null ? Number(r.lng) : (coordsForArea(r.area)?.lng ?? null),
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    payType: r.pay_type,
    payMin: r.pay_min,
    payMax: r.pay_max,
    negotiable: r.negotiable,
    paymentTerms: r.payment_terms,
    workersNeeded: r.workers_needed,
    filledSlots: r.filled_slots ?? 0,
    applicationDeadline: r.application_deadline,
    applicationCount: r.application_count,
    createdAt: r.created_at,
    publishedAt: r.published_at,
    isOwner,
    myApplication: r.my_application_id ? { id: r.my_application_id, status: r.my_application_status } : null,
    eligibility: trust && !isOwner ? evaluateEligibility(trust, { tier: r.tier, categoryId: r.category_id }) : null,
    saved: Boolean(r.saved),
  };
}

export async function getJobRow(db: Db, jobId: string, viewerId: string | null) {
  const { rows } = await db.query(`${JOB_SELECT} where j.id = $2`, [viewerId, jobId]);
  return rows[0];
}

async function ownedJob(db: Db, jobId: string, userId: string, lock = false) {
  const { rows } = await db.query(`select * from jobs where id = $1 ${lock ? "for update" : ""}`, [jobId]);
  const job = rows[0];
  if (!job) throw notFound("Job not found");
  if (job.employer_id !== userId) throw forbidden("Only the employer who posted this job can do that");
  return job;
}

async function tierFor(db: Db, categoryId: number): Promise<string> {
  const { rows } = await db.query("select tier from job_categories where id = $1 and active", [categoryId]);
  if (!rows[0]) throw badRequest("Unknown job category");
  return rows[0].tier;
}

// Marks published jobs past their deadline (or end time) as expired. Called lazily on reads so
// listings stay accurate without a separate cron. Jobs with active or completed pairings are left alone.
export async function expireStaleJobs(db: Db = pool) {
  const { rows } = await db.query(
    `update jobs j set status = 'expired', updated_at = now()
     where j.status = 'published'
       and not exists (
         select 1 from pairings p
         where p.job_id = j.id
           and p.status in ('pending_confirmation', 'confirmed', 'in_progress', 'completed', 'disputed')
       )
       and (
         (j.application_deadline is not null and j.application_deadline < now())
         or (j.application_deadline is null and j.ends_at is not null and j.ends_at < now())
       )
     returning j.id, j.title`,
  );
  for (const job of rows) {
    const apps = await db.query(
      `update applications set status = 'rejected', updated_at = now()
       where job_id = $1 and status = 'pending' returning worker_id`,
      [job.id],
    );
    for (const app of apps.rows) {
      await notify(db, app.worker_id, "job_expired", { jobId: job.id, title: job.title });
    }
  }
  return rows.length;
}

export const jobsRouter = Router();

jobsRouter.get("/jobs", async (req, res) => {
  await expireStaleJobs();
  const q = jobQuerySchema.parse(req.query);
  const viewerId = req.user?.id ?? null;
  const trust = viewerId ? await loadWorkerTrust(pool, viewerId) : null;

  const params: unknown[] = [viewerId];
  const where = [
    "j.status = 'published'",
    "j.invited_worker_id is null",
    "(j.application_deadline is null or j.application_deadline > now())",
    // $1 is the viewer (null when signed out, which matches no block rows).
    notBlockedSql("$1::uuid", "j.employer_id"),
  ];
  const add = (sql: (n: number) => string, value: unknown) => {
    params.push(value);
    where.push(sql(params.length));
  };
  if (q.q) add((n) => `(j.title ilike $${n} or j.description ilike $${n} or j.landmark ilike $${n})`, `%${q.q}%`);
  if (q.category) add((n) => `c.slug = $${n}`, q.category);
  if (q.tier) add((n) => `j.tier = $${n}`, q.tier);
  if (q.area) add((n) => `j.area = $${n}`, q.area);
  if (q.payType) add((n) => `j.pay_type = $${n}`, q.payType);
  if (q.minPay != null) add((n) => `coalesce(j.pay_max, j.pay_min) >= $${n}`, q.minPay);
  if (q.near) {
    const center = coordsForArea(q.near);
    if (!center) throw badRequest("Unknown neighborhood for distance search", "invalid_near_area");
    const radius = q.radiusKm ?? 5;
    // Haversine km; jobs without coords fall back to their area's known center via CASE.
    const jobLat = `coalesce(j.lat, case j.area
      when 'Kochi' then 7.69 when 'Merkato' then 7.678 when 'Bosa Kitto' then 7.66
      when 'JU Campus' then 7.68 when 'Hermata' then 7.67 when 'Awetu' then 7.665
      when 'Ginjo' then 7.655 else null end)`;
    const jobLng = `coalesce(j.lng, case j.area
      when 'Kochi' then 36.82 when 'Merkato' then 36.84 when 'Bosa Kitto' then 36.85
      when 'JU Campus' then 36.86 when 'Hermata' then 36.825 when 'Awetu' then 36.815
      when 'Ginjo' then 36.83 else null end)`;
    add(
      (n) => `${jobLat} is not null and (
        6371 * acos(least(1::float, greatest(-1::float,
          cos(radians($${n})) * cos(radians(${jobLat})) * cos(radians(${jobLng}) - radians($${n + 1}))
          + sin(radians($${n})) * sin(radians(${jobLat}))
        )))
      ) <= $${n + 2}`,
      center.lat,
    );
    params.push(center.lng, radius);
  }
  if (q.when) {
    const [fromDay, toDay] = WHEN_DAYS[q.when];
    where.push(
      `j.starts_at < ${JIMMA_TODAY} + interval '${toDay} days'`,
      `coalesce(j.ends_at, j.starts_at) >= ${JIMMA_TODAY} + interval '${fromDay} days'`,
    );
  }
  if (q.eligibleOnly && trust) {
    params.push([...trust.skillCategoryIds]);
    const skillParam = params.length;
    const vipOk = trust.identityVerified && trust.highTrustApproved;
    where.push(
      `(j.tier = 'ordinary' or (j.tier = 'skilled' and j.category_id = any($${skillParam}::int[]))${vipOk ? " or j.tier = 'vip'" : ""})`,
    );
  }
  params.push(q.limit);

  const { rows } = await pool.query(
    `${JOB_SELECT} where ${where.join(" and ")} order by j.published_at desc nulls last limit $${params.length}`,
    params,
  );
  res.json({ jobs: rows.map((r) => toJobSummary(r, viewerId, trust)) });
});

jobsRouter.get("/me/jobs", requireAuth, async (req, res) => {
  await expireStaleJobs();
  const me = currentUser(req);
  const { rows } = await pool.query(`${JOB_SELECT} where j.employer_id = $1 order by j.created_at desc`, [me.id]);
  res.json({ jobs: rows.map((r) => toJobSummary(r, me.id, null)) });
});

jobsRouter.get("/jobs/:id", async (req, res) => {
  await expireStaleJobs();
  const viewerId = req.user?.id ?? null;
  const row = await getJobRow(pool, idParam(req), viewerId);
  if (!row) throw notFound("Job not found");
  const canSee =
    row.employer_id === viewerId ||
    req.user?.role === "admin" ||
    row.my_application_id ||
    (row.status !== "draft" && (row.invited_worker_id == null || row.invited_worker_id === viewerId));
  if (!canSee) throw notFound("Job not found");
  const trust = viewerId ? await loadWorkerTrust(pool, viewerId) : null;
  res.json({ job: toJobSummary(row, viewerId, trust) });
});

async function insertJob(
  db: Db,
  employerId: string,
  body: {
    categoryId: number;
    title: string;
    description: string;
    area: string;
    landmark: string;
    startsAt?: Date | null;
    endsAt?: Date | null;
    payType: string;
    payMin?: number | null;
    payMax?: number | null;
    negotiable: boolean;
    paymentTerms: string;
    workersNeeded: number;
    applicationDeadline?: Date | null;
    publish: boolean;
  },
  tier: string,
) {
  const coords = coordsForArea(body.area);
  const { rows } = await db.query(
    `insert into jobs (employer_id, category_id, tier, title, description, area, landmark, lat, lng, starts_at, ends_at,
                       pay_type, pay_min, pay_max, negotiable, payment_terms, workers_needed, application_deadline,
                       status, published_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     returning id`,
    [
      employerId,
      body.categoryId,
      tier,
      body.title,
      body.description,
      body.area,
      body.landmark,
      coords?.lat ?? null,
      coords?.lng ?? null,
      body.startsAt ?? null,
      body.endsAt ?? null,
      body.payType,
      body.payMin ?? null,
      body.payMax ?? null,
      body.negotiable,
      body.paymentTerms,
      body.workersNeeded,
      body.applicationDeadline ?? null,
      body.publish ? "published" : "draft",
      body.publish ? new Date() : null,
    ],
  );
  return rows[0].id as string;
}

jobsRouter.post("/jobs", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = jobCreateSchema.parse(req.body);
  const tier = await tierFor(pool, body.categoryId);
  const id = await insertJob(pool, me.id, { ...body, publish: body.publish }, tier);
  const row = await getJobRow(pool, id, me.id);
  res.status(201).json({ job: toJobSummary(row, me.id, null) });
});

jobsRouter.post("/jobs/bulk", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = jobBulkCreateSchema.parse(req.body);
  const starts = body.shifts.map((s) => s.startsAt.getTime());
  if (new Set(starts).size !== starts.length) {
    throw badRequest("Each shift needs a distinct start time", "duplicate_shift");
  }
  const tier = await tierFor(pool, body.categoryId);
  const ids = await withTransaction(async (db) => {
    const created: string[] = [];
    for (const shift of body.shifts) {
      const id = await insertJob(
        db,
        me.id,
        {
          ...body,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt ?? null,
          publish: body.publish,
        },
        tier,
      );
      created.push(id);
    }
    return created;
  });
  const jobs = [];
  for (const id of ids) {
    const row = await getJobRow(pool, id, me.id);
    jobs.push(toJobSummary(row, me.id, null));
  }
  res.status(201).json({ jobs });
});

jobsRouter.patch("/jobs/:id", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = jobUpdateSchema.parse(req.body);
  const job = await ownedJob(pool, idParam(req), me.id);
  if (!["draft", "published"].includes(job.status)) {
    throw conflict(`A ${job.status} job can no longer be edited`, "job_not_editable");
  }

  const columns: Record<string, unknown> = {
    category_id: body.categoryId,
    tier: body.categoryId ? await tierFor(pool, body.categoryId) : undefined,
    title: body.title,
    description: body.description,
    area: body.area,
    landmark: body.landmark,
    starts_at: body.startsAt,
    ends_at: body.endsAt,
    pay_type: body.payType,
    pay_min: body.payMin,
    pay_max: body.payMax,
    negotiable: body.negotiable,
    payment_terms: body.paymentTerms,
    workers_needed: body.workersNeeded,
    application_deadline: body.applicationDeadline,
  };
  if (body.area !== undefined) {
    const coords = coordsForArea(body.area);
    columns.lat = coords?.lat ?? null;
    columns.lng = coords?.lng ?? null;
  }
  const entries = Object.entries(columns).filter(([, v]) => v !== undefined);
  if (entries.length) {
    const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(", ");
    await pool.query(`update jobs set ${sets}, updated_at = now() where id = $1`, [
      job.id,
      ...entries.map(([, v]) => v),
    ]);
  }
  const row = await getJobRow(pool, job.id, me.id);
  res.json({ job: toJobSummary(row, me.id, null) });
});

jobsRouter.post("/jobs/:id/publish", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const job = await ownedJob(pool, idParam(req), me.id);
  if (job.status !== "draft") throw conflict("Only draft jobs can be published", "job_not_draft");
  await pool.query("update jobs set status = 'published', published_at = now(), updated_at = now() where id = $1", [
    job.id,
  ]);
  const row = await getJobRow(pool, job.id, me.id);
  res.json({ job: toJobSummary(row, me.id, null) });
});

jobsRouter.post("/jobs/:id/cancel", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await withTransaction(async (db) => {
    const job = await ownedJob(db, idParam(req), me.id, true);
    if (["cancelled", "expired"].includes(job.status)) throw conflict("This job is already closed", "job_already_closed");
    const inProgress = await db.query(
      "select 1 from pairings where job_id = $1 and status in ('in_progress', 'completed')",
      [job.id],
    );
    if (inProgress.rowCount) {
      throw conflict("Work has already started on this job; cancel the pairing instead", "work_started");
    }

    await db.query("update jobs set status = 'cancelled', updated_at = now() where id = $1", [job.id]);
    const apps = await db.query(
      "update applications set status = 'rejected', updated_at = now() where job_id = $1 and status = 'pending' returning worker_id",
      [job.id],
    );
    const pairs = await db.query(
      `update pairings set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, updated_at = now()
       where job_id = $1 and status in ('pending_confirmation', 'confirmed') returning worker_id`,
      [job.id, me.id],
    );
    const affected = new Set([...apps.rows, ...pairs.rows].map((r) => r.worker_id as string));
    for (const workerId of affected) await notify(db, workerId, "job_cancelled", { jobId: job.id, title: job.title });
  });
  const row = await getJobRow(pool, idParam(req), me.id);
  res.json({ job: toJobSummary(row, me.id, null) });
});

jobsRouter.get("/me/favorites", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const trust = await loadWorkerTrust(pool, me.id);
  const { rows } = await pool.query(
    `${JOB_SELECT}
     join job_favorites fav on fav.job_id = j.id and fav.user_id = $1::uuid
     where ${notBlockedSql("$1::uuid", "j.employer_id")}
     order by fav.created_at desc`,
    [me.id],
  );
  res.json({ jobs: rows.map((r) => toJobSummary(r, me.id, trust)) });
});

jobsRouter.post("/jobs/:id/favorite", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const jobId = idParam(req);
  const exists = await pool.query("select 1 from jobs where id = $1", [jobId]);
  if (!exists.rowCount) throw notFound("Job not found");
  await pool.query("insert into job_favorites (user_id, job_id) values ($1, $2) on conflict do nothing", [
    me.id,
    jobId,
  ]);
  res.status(204).end();
});

jobsRouter.delete("/jobs/:id/favorite", requireAuth, async (req, res) => {
  const me = currentUser(req);
  await pool.query("delete from job_favorites where user_id = $1 and job_id = $2", [me.id, idParam(req)]);
  res.status(204).end();
});
