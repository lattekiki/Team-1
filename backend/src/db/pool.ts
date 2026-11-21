import pg from "pg";
import { env } from "../env.ts";
import { pgSsl } from "./ssl.ts";

// Return NUMERIC columns (pay amounts) as JS numbers; values stay well within double precision.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

const connectionString =
  env.NODE_ENV === "test" && env.TEST_DATABASE_URL ? env.TEST_DATABASE_URL : env.DATABASE_URL;

export const pool = new pg.Pool({
  connectionString,
  max: process.env.VERCEL ? 1 : 10,
  ssl: pgSsl(connectionString),
});

export type Db = Pick<pg.PoolClient, "query">;

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
