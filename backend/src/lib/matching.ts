import { coordsForArea, type JobMatch, type MatchReason, type Tier } from "@team1/shared";
import type { Db } from "../db/pool.ts";
import { evaluateEligibility, type WorkerTrust } from "./eligibility.ts";

export type WorkerMatchProfile = {
  area: string;
  travelKm: number;
  skillCategoryIds: Set<number>;
  completedCategoryIds: Set<number>;
};

export type JobMatchInput = {
  categoryId: number;
  tier: Tier;
  area: string;
  lat: number | null;
  lng: number | null;
};

export type ApplicantMatchInput = {
  area: string;
  skillCategoryIds: number[];
  completedInCategory: number;
};

const WEIGHTS: Record<MatchReason, number> = {
  skill: 40,
  similar_work: 20,
  same_area: 25,
  nearby: 15,
  open_in_area: 10,
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function jobCoords(job: JobMatchInput) {
  if (job.lat != null && job.lng != null) return { lat: job.lat, lng: job.lng };
  return coordsForArea(job.area);
}

/** Score a published job for a worker. Eligibility is a filter, never a ranking signal. */
export function scoreJobForWorker(
  worker: WorkerMatchProfile,
  trust: WorkerTrust,
  job: JobMatchInput,
): JobMatch | null {
  const eligibility = evaluateEligibility(trust, { tier: job.tier, categoryId: job.categoryId });
  if (!eligibility.eligible) return null;

  const reasons: MatchReason[] = [];
  if (worker.skillCategoryIds.has(job.categoryId)) reasons.push("skill");
  if (worker.completedCategoryIds.has(job.categoryId)) reasons.push("similar_work");
  if (worker.area && job.area && worker.area === job.area) reasons.push("same_area");
  else if (worker.area) {
    const from = coordsForArea(worker.area);
    const to = jobCoords(job);
    const range = worker.travelKm > 0 ? worker.travelKm : 5;
    if (from && to && haversineKm(from, to) <= range) reasons.push("nearby");
  }
  if (reasons.length === 0 && job.tier === "ordinary") reasons.push("open_in_area");
  if (reasons.length === 0) return null;

  const score = reasons.reduce((sum, r) => sum + WEIGHTS[r], 0);
  return { score, reasons };
}

export function scoreApplicantForJob(job: { categoryId: number; area: string }, applicant: ApplicantMatchInput): JobMatch {
  const reasons: MatchReason[] = [];
  if (applicant.skillCategoryIds.includes(job.categoryId)) reasons.push("skill");
  if (applicant.completedInCategory > 0) reasons.push("similar_work");
  if (applicant.area && job.area && applicant.area === job.area) reasons.push("same_area");
  else if (applicant.area && job.area) {
    const from = coordsForArea(applicant.area);
    const to = coordsForArea(job.area);
    if (from && to && haversineKm(from, to) <= 5) reasons.push("nearby");
  }
  if (reasons.length === 0) reasons.push("open_in_area");
  const score = reasons.reduce((sum, r) => sum + WEIGHTS[r], 0);
  return { score, reasons };
}

const JOB_PHRASE: Record<MatchReason, string> = {
  skill: "your listed skills match this category",
  similar_work: "you have completed similar work",
  same_area: "it is in your neighborhood",
  nearby: "it is within your travel range",
  open_in_area: "it is an open ordinary job you can apply to",
};

const APPLICANT_PHRASE: Record<MatchReason, string> = {
  skill: "skills match this job category",
  similar_work: "has completed similar work",
  same_area: "lives in the same neighborhood",
  nearby: "is nearby",
  open_in_area: "applied — new workers stay visible",
};

export function templateMatchBlurb(input: {
  title: string;
  area: string;
  reasons: MatchReason[];
  subject?: "job" | "applicant";
}): string {
  const phrases = input.subject === "applicant" ? APPLICANT_PHRASE : JOB_PHRASE;
  const why = input.reasons.map((r) => phrases[r]).join("; ");
  if (input.subject === "applicant") {
    return why ? `Fit: ${why}.` : `Applicant for ${input.title} in ${input.area}.`;
  }
  return why ? `${input.title} in ${input.area} — ${why}.` : `${input.title} in ${input.area}.`;
}

/** Keep every original item. Unknown ids from the model are ignored. */
export function mergeLlmOrder<T extends { id: string }>(original: T[], orderedIds: string[]): T[] {
  const byId = new Map(original.map((x) => [x.id, x]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item && !seen.has(id)) {
      out.push(item);
      seen.add(id);
    }
  }
  for (const item of original) {
    if (!seen.has(item.id)) out.push(item);
  }
  return out;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  errands: ["errand", "queue", "bill", "market run", "fetch"],
  "event-support": ["event", "wedding", "catering", "cooking", "usher"],
  "shop-help": ["shop", "till", "cashier", "store", "counter"],
  delivery: ["deliver", "courier", "driver", "drop off", "pickup parcel"],
  "shop-cleaning": ["office clean", "shop clean", "sweep", "mop store"],
  plumbing: ["plumb", "pipe", "leak", "sink", "tap", "toilet"],
  electrical: ["electric", "wiring", "socket", "light fixture", "breaker"],
  repair: ["repair", "fix", "phone screen", "furniture"],
  tutoring: ["tutor", "math", "english", "lesson", "homework"],
  photography: ["photo", "camera", "shoot", "portrait"],
  design: ["design", "logo", "poster", "graphic"],
  "household-cleaning": ["house clean", "home clean", "deep clean"],
  "household-help": ["household", "house help", "nanny house"],
  childcare: ["child", "babysit", "nanny", "kids"],
  "school-pickup": ["school pickup", "school run", "collect from school"],
};

export function suggestCategorySlugs(title: string, description: string): { slug: string; hits: number }[] {
  const text = `${title} ${description}`.toLowerCase();
  const scored: { slug: string; hits: number }[] = [];
  for (const [slug, words] of Object.entries(CATEGORY_KEYWORDS)) {
    let hits = 0;
    for (const w of words) {
      if (text.includes(w)) hits += 1;
    }
    if (hits) scored.push({ slug, hits });
  }
  return scored.sort((a, b) => b.hits - a.hits);
}

export async function loadWorkerMatchProfile(db: Db, userId: string): Promise<WorkerMatchProfile> {
  const [profile, completed] = await Promise.all([
    db.query(
      `select coalesce(w.area, '') as area, coalesce(w.travel_km, 5) as travel_km,
              coalesce(array_agg(distinct s.category_id) filter (where s.category_id is not null), '{}') as skill_categories
       from users u
       left join worker_profiles w on w.user_id = u.id
       left join user_skills us on us.user_id = u.id
       left join skills s on s.id = us.skill_id
       where u.id = $1
       group by w.area, w.travel_km`,
      [userId],
    ),
    db.query(
      `select distinct j.category_id
       from pairings p
       join jobs j on j.id = p.job_id
       where p.worker_id = $1 and p.status = 'completed'`,
      [userId],
    ),
  ]);
  const row = profile.rows[0];
  return {
    area: row?.area ?? "",
    travelKm: Number(row?.travel_km ?? 5),
    skillCategoryIds: new Set<number>(row?.skill_categories ?? []),
    completedCategoryIds: new Set<number>(completed.rows.map((r) => r.category_id)),
  };
}
