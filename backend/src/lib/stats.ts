import type { Db } from "../db/pool.ts";

// Reputation figures for a set of users: average visible rating and completed pairings.
export async function reputationFor(db: Db, userIds: string[]) {
  const result = new Map<string, { rating: number | null; reviewCount: number; completedJobs: number }>();
  if (userIds.length === 0) return result;
  const { rows } = await db.query(
    `select u.id,
            (select round(avg(r.overall)::numeric, 2) from reviews r
              where r.reviewee_id = u.id and r.moderation_status = 'visible') as rating,
            (select count(*) from reviews r
              where r.reviewee_id = u.id and r.moderation_status = 'visible')::int as review_count,
            (select count(*) from pairings p
              where (p.worker_id = u.id or p.employer_id = u.id) and p.status = 'completed')::int as completed_jobs
     from users u where u.id = any($1::uuid[])`,
    [userIds],
  );
  for (const r of rows) {
    result.set(r.id, { rating: r.rating, reviewCount: r.review_count, completedJobs: r.completed_jobs });
  }
  return result;
}
