import pg from "pg";
import { ensureDatabaseExists, migrate } from "../src/db/migrate.ts";

// Recreates the test database schema from migrations before each run.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL in .env to run tests");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");

  await ensureDatabaseExists(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("drop schema public cascade; create schema public;");
  await client.end();
  await migrate(url);
}
