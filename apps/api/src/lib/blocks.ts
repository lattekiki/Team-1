import type { Db } from "../db/pool.ts";
import { forbidden } from "./errors.ts";

// A block works in both directions for new interactions: if either user blocked the other, they can't
// apply to, select, or rebook each other and don't see each other in lists.
export async function isBlockedBetween(db: Db, a: string, b: string) {
  const { rowCount } = await db.query(
    `select 1 from user_blocks
     where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)`,
    [a, b],
  );
  return (rowCount ?? 0) > 0;
}

export async function assertNotBlocked(db: Db, a: string, b: string) {
  if (await isBlockedBetween(db, a, b)) {
    throw forbidden("You can't interact with this user", "blocked");
  }
}

// SQL fragment: true when no block exists between the user in `userA` and the user in `userB` (column or param refs).
export const notBlockedSql = (userA: string, userB: string) =>
  `not exists (select 1 from user_blocks ub
               where (ub.blocker_id = ${userA} and ub.blocked_id = ${userB})
                  or (ub.blocker_id = ${userB} and ub.blocked_id = ${userA}))`;
