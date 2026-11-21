import { Router } from "express";
import {
  employerProfileSchema,
  updateMeSchema,
  workerProfileSchema,
  type Category,
  type PublicProfile,
  type PublicStats,
  type Skill,
} from "@team1/shared";
import { pool, withTransaction } from "../db/pool.ts";
import { currentUser, requireAuth } from "../lib/auth.ts";
import { badRequest, conflict, notFound } from "../lib/errors.ts";
import { reputationFor } from "../lib/stats.ts";
import { loadMe } from "./auth.ts";

export const profilesRouter = Router();

profilesRouter.patch("/me", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = updateMeSchema.parse(req.body);
  if (body.username) {
    const taken = await pool.query("select 1 from users where lower(username) = lower($1) and id <> $2", [
      body.username,
      me.id,
    ]);
    if (taken.rowCount) throw conflict("That username is taken", "username_taken");
  }
  await pool.query(
    `update users set
       username = coalesce($2, username),
       language = coalesce($3, language),
       active_mode = coalesce($4, active_mode),
       updated_at = now()
     where id = $1`,
    [me.id, body.username ?? null, body.language ?? null, body.activeMode ?? null],
  );
  res.json({ user: await loadMe(me.id) });
});

profilesRouter.get("/me/profile", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const [worker, employer, skills] = await Promise.all([
    pool.query("select * from worker_profiles where user_id = $1", [me.id]),
    pool.query("select * from employer_profiles where user_id = $1", [me.id]),
    pool.query("select skill_id from user_skills where user_id = $1", [me.id]),
  ]);
  const w = worker.rows[0];
  const e = employer.rows[0];
  res.json({
    worker: w && {
      bio: w.bio,
      experienceLevel: w.experience_level,
      availability: w.availability,
      area: w.area,
      landmark: w.landmark,
      travelKm: w.travel_km,
      skillIds: skills.rows.map((r) => r.skill_id),
    },
    employer: e && { employerType: e.employer_type, businessName: e.business_name, area: e.area },
  });
});

profilesRouter.put("/me/worker-profile", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const p = workerProfileSchema.parse(req.body);
  await withTransaction(async (db) => {
    await db.query(
      `insert into worker_profiles (user_id, bio, experience_level, availability, area, landmark, travel_km)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id) do update set
         bio = excluded.bio, experience_level = excluded.experience_level, availability = excluded.availability,
         area = excluded.area, landmark = excluded.landmark, travel_km = excluded.travel_km, updated_at = now()`,
      [me.id, p.bio, p.experienceLevel, p.availability, p.area, p.landmark, p.travelKm],
    );
    if (p.skillIds.length) {
      const valid = await db.query("select count(*)::int as n from skills where id = any($1::int[])", [p.skillIds]);
      if (valid.rows[0].n !== new Set(p.skillIds).size) throw badRequest("Unknown skill selected");
    }
    await db.query("delete from user_skills where user_id = $1", [me.id]);
    if (p.skillIds.length) {
      await db.query(
        "insert into user_skills (user_id, skill_id) select $1, unnest($2::int[]) on conflict do nothing",
        [me.id, p.skillIds],
      );
    }
  });
  res.json({ ok: true });
});

profilesRouter.put("/me/employer-profile", requireAuth, async (req, res) => {
  const me = currentUser(req);
  const p = employerProfileSchema.parse(req.body);
  await pool.query(
    `insert into employer_profiles (user_id, employer_type, business_name, area)
     values ($1, $2, $3, $4)
     on conflict (user_id) do update set
       employer_type = excluded.employer_type, business_name = excluded.business_name,
       area = excluded.area, updated_at = now()`,
    [me.id, p.employerType, p.businessName ?? null, p.area],
  );
  res.json({ ok: true });
});

profilesRouter.get("/users/:username", async (req, res) => {
  const { rows } = await pool.query(
    `select u.id, u.username, u.created_at, u.identity_verified, u.high_trust_approved,
            w.bio, w.experience_level, w.availability, w.area as worker_area,
            e.employer_type, e.business_name, e.area as employer_area
     from users u
     left join worker_profiles w on w.user_id = u.id
     left join employer_profiles e on e.user_id = u.id
     where lower(u.username) = lower($1) and u.status = 'active'`,
    [req.params.username],
  );
  const u = rows[0];
  if (!u) throw notFound("User not found");

  const [rep, skills, reviews] = await Promise.all([
    reputationFor(pool, [u.id]),
    pool.query(
      "select s.slug, s.name from user_skills us join skills s on s.id = us.skill_id where us.user_id = $1 order by s.name",
      [u.id],
    ),
    pool.query(
      `select r.overall, r.body, r.created_at, ru.username as reviewer
       from reviews r join users ru on ru.id = r.reviewer_id
       where r.reviewee_id = $1 and r.moderation_status = 'visible'
       order by r.created_at desc limit 20`,
      [u.id],
    ),
  ]);
  const r = rep.get(u.id);
  const profile: PublicProfile = {
    username: u.username,
    memberSince: u.created_at,
    identityVerified: u.identity_verified,
    highTrustApproved: u.high_trust_approved,
    rating: r?.rating ?? null,
    reviewCount: r?.reviewCount ?? 0,
    completedJobs: r?.completedJobs ?? 0,
    worker:
      u.experience_level != null
        ? {
            bio: u.bio,
            experienceLevel: u.experience_level,
            availability: u.availability,
            area: u.worker_area,
            skills: skills.rows.map((s) => ({ slug: s.slug, name: s.name })),
          }
        : null,
    employer:
      u.employer_type != null
        ? { employerType: u.employer_type, businessName: u.business_name, area: u.employer_area }
        : null,
    reviews: reviews.rows.map((rv) => ({
      overall: rv.overall,
      body: rv.body,
      reviewer: rv.reviewer,
      createdAt: rv.created_at,
    })),
  };
  res.json({ profile });
});

profilesRouter.get("/categories", async (_req, res) => {
  const { rows } = await pool.query(
    `select c.id, c.slug, c.name, c.tier,
            (select count(*) from jobs j
              where j.category_id = c.id and j.status = 'published' and j.invited_worker_id is null)::int as open_jobs
     from job_categories c where c.active order by c.id`,
  );
  const categories: Category[] = rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    tier: c.tier,
    openJobs: c.open_jobs,
  }));
  res.json({ categories });
});

profilesRouter.get("/skills", async (_req, res) => {
  const { rows } = await pool.query("select id, slug, name, category_id from skills order by name");
  const skills: Skill[] = rows.map((s) => ({ id: s.id, slug: s.slug, name: s.name, categoryId: s.category_id }));
  res.json({ skills });
});

profilesRouter.get("/stats", async (_req, res) => {
  const { rows } = await pool.query(
    `select
       (select count(*) from users where status = 'active' and role = 'user')::int as workers,
       (select count(distinct employer_id) from jobs where status <> 'draft')::int as employers,
       (select count(*) from jobs where status = 'published' and invited_worker_id is null)::int as open_jobs,
       (select count(*) from pairings where status = 'completed')::int as completed_jobs`,
  );
  const r = rows[0];
  const stats: PublicStats = {
    workers: r.workers,
    employers: r.employers,
    openJobs: r.open_jobs,
    completedJobs: r.completed_jobs,
  };
  res.json({ stats });
});
