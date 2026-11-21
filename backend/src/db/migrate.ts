import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "../env.ts";
import { pgSsl } from "./ssl.ts";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");

export async function ensureDatabaseExists(connectionString: string) {
  const target = new pg.Client({ connectionString, ssl: pgSsl(connectionString) });
  try {
    await target.connect();
    await target.query("select 1");
    return;
  } catch {
    // Hosted Postgres (Render, Neon) already has the database. CREATE is local-only.
  } finally {
    await target.end().catch(() => undefined);
  }

  const url = new URL(connectionString);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString(), ssl: pgSsl(url.toString()) });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [dbName]);
    if (!rowCount) {
      await admin.query(`create database "${dbName.replace(/"/g, '""')}"`);
      console.log(`Created database ${dbName}`);
    }
  } finally {
    await admin.end();
  }
}

export async function migrate(connectionString: string) {
  await ensureDatabaseExists(connectionString);
  const client = new pg.Client({ connectionString, ssl: pgSsl(connectionString) });
  await client.connect();
  try {
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const { rows } = await client.query<{ name: string }>("select name from schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`Applied ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate(env.DATABASE_URL)
    .then(() => console.log("Migrations up to date"))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
