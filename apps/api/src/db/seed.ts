import { pool } from "./pool.ts";

// Demo accounts for local development. Sign in with these phones; the OTP code is printed by the API.
const users = [
  { phone: "+251911000001", username: "admin", role: "admin", mode: "employer" },
  { phone: "+251911000002", username: "abebe_worker", role: "user", mode: "worker" },
  { phone: "+251911000003", username: "jimma_shop", role: "user", mode: "employer" },
] as const;

async function seed() {
  for (const u of users) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (phone, username, role, active_mode) values ($1, $2, $3, $4)
       on conflict (phone) do update set username = excluded.username, role = excluded.role
       returning id`,
      [u.phone, u.username, u.role, u.mode],
    );
    const id = rows[0]!.id;
    await pool.query("insert into worker_profiles (user_id, area) values ($1, 'Hermata') on conflict do nothing", [id]);
    await pool.query("insert into employer_profiles (user_id, area) values ($1, 'Merkato') on conflict do nothing", [id]);
    console.log(`Seeded ${u.username} (${u.phone})`);
  }
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
