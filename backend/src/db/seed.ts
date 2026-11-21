import { pool } from "./pool.ts";

// Demo accounts for local development. Sign in with these phones; the OTP code is printed by the API.
const users = [
  { phone: "+251911000001", username: "admin", role: "admin", mode: "employer", employerType: "individual" },
  { phone: "+251911000002", username: "abebe_worker", role: "user", mode: "worker", employerType: "individual" },
  { phone: "+251911000003", username: "merkato_shop", role: "user", mode: "employer", employerType: "business" },
  { phone: "+251911000004", username: "kochi_family", role: "user", mode: "employer", employerType: "household" },
] as const;

type DemoJob = {
  employer: (typeof users)[number]["username"];
  category: string;
  title: string;
  description: string;
  area: string;
  landmark: string;
  startInDays: number;
  hours: number;
  payType: "hourly" | "daily" | "fixed" | "recurring" | "negotiable";
  payMin: number | null;
  payMax: number | null;
  negotiable?: boolean;
  paymentTerms: string;
  workersNeeded?: number;
};

const jobs: DemoJob[] = [
  {
    employer: "merkato_shop",
    category: "shop-help",
    title: "Weekend shop assistant at Merkato",
    description: "Help serve customers, restock shelves and keep the counter tidy on a busy market day.",
    area: "Merkato",
    landmark: "Near the main bus station",
    startInDays: 2,
    hours: 8,
    payType: "daily",
    payMin: 350,
    payMax: 350,
    paymentTerms: "Cash at end of day",
  },
  {
    employer: "merkato_shop",
    category: "delivery",
    title: "Deliver coffee orders around Bosa Kitto",
    description: "Carry packed coffee orders to about 10 nearby shops. Bajaj fare is covered separately.",
    area: "Bosa Kitto",
    landmark: "",
    startInDays: 1,
    hours: 4,
    payType: "fixed",
    payMin: 250,
    payMax: 300,
    negotiable: true,
    paymentTerms: "Telebirr after the last delivery",
  },
  {
    employer: "merkato_shop",
    category: "event-support",
    title: "Wedding hall setup crew (3 people)",
    description: "Arrange chairs and tables, hang decorations and clean up afterwards.",
    area: "Hermata",
    landmark: "Hermata event hall",
    startInDays: 5,
    hours: 6,
    payType: "fixed",
    payMin: 400,
    payMax: 400,
    paymentTerms: "Cash on completion",
    workersNeeded: 3,
  },
  {
    employer: "kochi_family",
    category: "tutoring",
    title: "Grade 8 maths tutor, twice a week",
    description: "Looking for a patient tutor to help our son prepare for the regional exam. Evenings at home.",
    area: "Kochi",
    landmark: "",
    startInDays: 3,
    hours: 2,
    payType: "hourly",
    payMin: 150,
    payMax: 200,
    paymentTerms: "Weekly, cash",
  },
  {
    employer: "kochi_family",
    category: "plumbing",
    title: "Fix leaking kitchen sink and tap",
    description: "Kitchen sink pipe leaks and the tap drips. Please bring your own tools.",
    area: "Kochi",
    landmark: "",
    startInDays: 1,
    hours: 3,
    payType: "negotiable",
    payMin: null,
    payMax: null,
    negotiable: true,
    paymentTerms: "Agree price on inspection; parts paid separately",
  },
  {
    employer: "kochi_family",
    category: "childcare",
    title: "Afternoon childcare for two children",
    description: "Pick up from school at Awetu and look after two children (6 and 9) until 6pm on weekdays.",
    area: "Awetu",
    landmark: "",
    startInDays: 7,
    hours: 4,
    payType: "recurring",
    payMin: 3500,
    payMax: 4000,
    paymentTerms: "Monthly, by bank transfer",
  },
];

async function seed() {
  const ids = new Map<string, string>();
  for (const u of users) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (phone, username, role, active_mode) values ($1, $2, $3, $4)
       on conflict (phone) do update set username = excluded.username, role = excluded.role
       returning id`,
      [u.phone, u.username, u.role, u.mode],
    );
    const id = rows[0]!.id;
    ids.set(u.username, id);
    await pool.query("insert into worker_profiles (user_id, area) values ($1, 'Hermata') on conflict do nothing", [id]);
    await pool.query(
      `insert into employer_profiles (user_id, employer_type, area) values ($1, $2, 'Merkato')
       on conflict (user_id) do update set employer_type = excluded.employer_type`,
      [id, u.employerType],
    );
    console.log(`Seeded ${u.username} (${u.phone})`);
  }

  for (const j of jobs) {
    const employerId = ids.get(j.employer)!;
    const exists = await pool.query("select 1 from jobs where employer_id = $1 and title = $2", [employerId, j.title]);
    if (exists.rowCount) continue;
    const start = new Date();
    start.setDate(start.getDate() + j.startInDays);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + j.hours * 3600_000);
    await pool.query(
      `insert into jobs (employer_id, category_id, tier, title, description, area, landmark, starts_at, ends_at,
                         pay_type, pay_min, pay_max, negotiable, payment_terms, workers_needed, status, published_at)
       select $1, c.id, c.tier, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'published', now()
       from job_categories c where c.slug = $2`,
      [
        employerId,
        j.category,
        j.title,
        j.description,
        j.area,
        j.landmark,
        start,
        end,
        j.payType,
        j.payMin,
        j.payMax,
        j.negotiable ?? false,
        j.paymentTerms,
        j.workersNeeded ?? 1,
      ],
    );
    console.log(`Seeded job: ${j.title}`);
  }
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
