import type { Eligibility, Tier } from "@team1/shared";
import type { Db } from "../db/pool.ts";
import { AppError } from "./errors.ts";

export type WorkerTrust = {
  active: boolean;
  identityVerified: boolean;
  highTrustApproved: boolean;
  skillCategoryIds: Set<number>;
};

export async function loadWorkerTrust(db: Db, userId: string): Promise<WorkerTrust> {
  const { rows } = await db.query(
    `select u.status, u.identity_verified, u.high_trust_approved,
            coalesce(array_agg(distinct s.category_id) filter (where s.category_id is not null), '{}') as skill_categories
     from users u
     left join user_skills us on us.user_id = u.id
     left join skills s on s.id = us.skill_id
     where u.id = $1
     group by u.id`,
    [userId],
  );
  const u = rows[0];
  return {
    active: u?.status === "active",
    identityVerified: Boolean(u?.identity_verified),
    highTrustApproved: Boolean(u?.high_trust_approved),
    skillCategoryIds: new Set<number>(u?.skill_categories ?? []),
  };
}

// Tier eligibility is a hard filter (SRS section 7). Ratings never substitute for these checks.
export function evaluateEligibility(trust: WorkerTrust, job: { tier: Tier; categoryId: number }): Eligibility {
  if (!trust.active) return { eligible: false, code: "inactive", reason: "Your account is not active" };
  if (job.tier === "skilled" && !trust.skillCategoryIds.has(job.categoryId)) {
    return {
      eligible: false,
      code: "skill_required",
      reason: "Add a matching skill to your worker profile to apply for skilled jobs",
    };
  }
  if (job.tier === "vip") {
    if (!trust.identityVerified) {
      return { eligible: false, code: "identity_required", reason: "VIP jobs require identity verification" };
    }
    if (!trust.highTrustApproved) {
      return {
        eligible: false,
        code: "high_trust_required",
        reason: "VIP jobs require high-trust approval from the safety team",
      };
    }
  }
  return { eligible: true };
}

export async function checkEligibility(db: Db, userId: string, job: { tier: Tier; categoryId: number }) {
  return evaluateEligibility(await loadWorkerTrust(db, userId), job);
}

export const notEligible = (e: Eligibility) =>
  new AppError(403, "not_eligible", e.reason ?? "Not eligible", { reason: e.code });
