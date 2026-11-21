import { env } from "../env.ts";
import { forbidden } from "./errors.ts";

/**
 * VIP / household / childcare categories stay off in production until safeguarding is confirmed (PLAN §10).
 * `VIP_CATEGORIES=on` forces them on; `off` forces them off; unset follows NODE_ENV.
 */
export function vipCategoriesEnabledFor(nodeEnv: string, flag: "on" | "off" | undefined) {
  if (flag === "on") return true;
  if (flag === "off") return false;
  return nodeEnv !== "production";
}

export const vipCategoriesEnabled = vipCategoriesEnabledFor(env.NODE_ENV, env.VIP_CATEGORIES);

export function assertVipCategoriesOpen(tier: string) {
  if (tier === "vip" && !vipCategoriesEnabled) {
    throw forbidden(
      "Household and childcare categories are paused until safeguarding is confirmed",
      "vip_categories_disabled",
    );
  }
}
