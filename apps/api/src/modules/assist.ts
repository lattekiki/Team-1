import { Router } from "express";
import { assistRequestSchema } from "@team1/shared";
import { pool } from "../db/pool.ts";
import { currentUser, requireAuth } from "../lib/auth.ts";
import { badRequest } from "../lib/errors.ts";
import { assistConfig, draftAssist } from "../lib/llm.ts";

export const assistRouter = Router();

assistRouter.get("/assist/config", (_req, res) => {
  res.json(assistConfig());
});

assistRouter.post("/assist", requireAuth, async (req, res) => {
  const cfg = assistConfig();
  if (!cfg.enabled) throw badRequest("Writing assist is turned off", "assist_disabled");

  const body = assistRequestSchema.parse(req.body);
  const me = currentUser(req);

  let title = body.title;
  let description = body.description;
  let area = body.area;
  let categoryName = body.categoryName;
  let workerBio = "";
  let workerSkills: string[] = [];

  if (body.kind === "apply_message") {
    if (body.jobId) {
      const job = await pool.query(
        `select j.title, j.description, j.area, c.name as category_name
         from jobs j join job_categories c on c.id = j.category_id
         where j.id = $1`,
        [body.jobId],
      );
      const j = job.rows[0];
      if (j) {
        title = title || j.title;
        description = description || j.description;
        area = area || j.area;
        categoryName = categoryName || j.category_name;
      }
    }
    const profile = await pool.query(
      `select coalesce(w.bio, '') as bio, coalesce(w.area, '') as area,
              coalesce(array_agg(s.name) filter (where s.name is not null), '{}') as skills
       from users u
       left join worker_profiles w on w.user_id = u.id
       left join user_skills us on us.user_id = u.id
       left join skills s on s.id = us.skill_id
       where u.id = $1
       group by w.bio, w.area`,
      [me.id],
    );
    const p = profile.rows[0];
    workerBio = p?.bio ?? "";
    workerSkills = p?.skills ?? [];
    if (!area) area = p?.area ?? "";
  }

  const { text, provider } = await draftAssist({
    kind: body.kind,
    language: me.language,
    title,
    description,
    area,
    categoryName,
    notes: body.notes,
    workerBio,
    workerSkills,
    username: me.username ?? "worker",
  });
  res.json({ text, provider });
});
