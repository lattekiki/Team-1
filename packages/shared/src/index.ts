import { z } from "zod";

export const LANGUAGES = ["en", "am", "om"] as const;
export const ROLES = ["user", "support", "admin"] as const;
export const MODES = ["worker", "employer"] as const;
export const TIERS = ["ordinary", "skilled", "vip"] as const;
export const PAY_TYPES = ["hourly", "daily", "fixed", "recurring", "negotiable"] as const;
export const EMPLOYER_TYPES = ["individual", "household", "business", "institution"] as const;
export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "experienced", "expert"] as const;
export const VERIFICATION_KINDS = ["identity", "skill", "high_trust"] as const;
export const REPORT_TARGETS = ["user", "job", "pairing", "review"] as const;

export const JOB_STATUSES = ["draft", "published", "filled", "cancelled", "expired"] as const;
export const APPLICATION_STATUSES = ["pending", "selected", "rejected", "withdrawn"] as const;
export const PAIRING_STATUSES = [
  "pending_confirmation",
  "confirmed",
  "in_progress",
  "completed",
  "declined",
  "cancelled",
  "disputed",
] as const;
export const CONTACT_VISIBLE_PAIRING_STATUSES = ["confirmed", "in_progress", "completed"] as const;

export const JIMMA_AREAS = [
  { id: "Kochi", am: "ኮቺ" },
  { id: "Merkato", am: "መርካቶ" },
  { id: "Bosa Kitto", am: "ቦሳ ኪቶ" },
  { id: "JU Campus", am: "ዩኒቨርሲቲ" },
  { id: "Hermata", am: "ሄርማታ" },
  { id: "Awetu", am: "አዌቱ" },
  { id: "Ginjo", am: "ጊንጆ" },
] as const;

export type Language = (typeof LANGUAGES)[number];
export type Role = (typeof ROLES)[number];
export type Mode = (typeof MODES)[number];
export type Tier = (typeof TIERS)[number];
export type PayType = (typeof PAY_TYPES)[number];
export type EmployerType = (typeof EMPLOYER_TYPES)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type PairingStatus = (typeof PAIRING_STATUSES)[number];

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

// Ethiopian mobile numbers, normalized to +2519XXXXXXXX or +2517XXXXXXXX.
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .transform((v) => (v.startsWith("0") ? `+251${v.slice(1)}` : v.startsWith("251") ? `+${v}` : v))
  .pipe(z.string().regex(/^\+251[79]\d{8}$/, "Enter an Ethiopian mobile number, e.g. 0911234567"));

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only");

export const otpRequestSchema = z.object({ phone: phoneSchema });

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  username: usernameSchema.optional(),
  language: z.enum(LANGUAGES).optional(),
});

export const updateMeSchema = z.object({
  username: usernameSchema.optional(),
  language: z.enum(LANGUAGES).optional(),
  activeMode: z.enum(MODES).optional(),
});

export const workerProfileSchema = z.object({
  bio: z.string().trim().max(1000).default(""),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).default("beginner"),
  availability: z.string().trim().max(300).default(""),
  area: z.string().trim().max(80).default(""),
  landmark: z.string().trim().max(120).default(""),
  travelKm: z.coerce.number().int().min(0).max(100).default(5),
  skillIds: z.array(z.number().int().positive()).max(20).default([]),
});

export const employerProfileSchema = z.object({
  employerType: z.enum(EMPLOYER_TYPES).default("individual"),
  businessName: z.string().trim().max(120).nullish(),
  area: z.string().trim().max(80).default(""),
});

const money = z.coerce.number().min(0).max(10_000_000);
const optionalDate = z.coerce.date().nullish();

const jobFields = z.object({
  categoryId: z.coerce.number().int().positive(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000).default(""),
  area: z.string().trim().min(2).max(80),
  landmark: z.string().trim().max(120).default(""),
  startsAt: optionalDate,
  endsAt: optionalDate,
  payType: z.enum(PAY_TYPES),
  payMin: money.nullish(),
  payMax: money.nullish(),
  negotiable: z.boolean().default(false),
  paymentTerms: z.string().trim().max(300).default(""),
  workersNeeded: z.coerce.number().int().min(1).max(100).default(1),
  applicationDeadline: optionalDate,
});

const jobChecks = <T extends z.ZodType<Partial<z.infer<typeof jobFields>>>>(schema: T) =>
  schema
    .refine((j) => !j.startsAt || !j.endsAt || j.endsAt > j.startsAt, {
      message: "End time must be after start time",
      path: ["endsAt"],
    })
    .refine((j) => j.payMin == null || j.payMax == null || j.payMax >= j.payMin, {
      message: "Maximum pay must be at least the minimum",
      path: ["payMax"],
    });

export const jobCreateSchema = jobChecks(jobFields.extend({ publish: z.boolean().default(false) }));
export const jobUpdateSchema = jobChecks(jobFields.partial());

export const JOB_WHEN = ["today", "tomorrow", "week"] as const;
export type JobWhen = (typeof JOB_WHEN)[number];

export const jobQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  tier: z.enum(TIERS).optional(),
  area: z.string().trim().max(80).optional(),
  payType: z.enum(PAY_TYPES).optional(),
  minPay: z.coerce.number().min(0).optional(),
  when: z.enum(JOB_WHEN).optional(),
  eligibleOnly: z.enum(["1", "true"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const applicationCreateSchema = z.object({
  message: z.string().trim().min(10, "Tell the employer a little about your experience").max(2000),
  proposedPay: money.nullish(),
});

const rating = z.coerce.number().int().min(1).max(5);
export const reviewCreateSchema = z.object({
  overall: rating,
  reliability: rating.nullish(),
  communication: rating.nullish(),
  quality: rating.nullish(),
  body: z.string().trim().max(2000).default(""),
});

export const rebookSchema = z.object({
  startsAt: optionalDate,
  endsAt: optionalDate,
  payMin: money.nullish(),
  payMax: money.nullish(),
  description: z.string().trim().max(4000).optional(),
});

export const reportCreateSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(5).max(2000),
});

export const verificationCreateSchema = z.object({
  kind: z.enum(VERIFICATION_KINDS),
  note: z.string().trim().min(5, "Describe what you can provide (ID type, certificate, references)").max(2000),
});

export const adminDecisionSchema = z.object({ note: z.string().trim().max(1000).optional() });
export const reportResolveSchema = z.object({
  status: z.enum(["reviewing", "resolved", "dismissed"]),
  note: z.string().trim().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type ApiError = { error: { code: string; message: string; details?: unknown } };

export type Me = {
  id: string;
  phone: string;
  username: string | null;
  language: Language;
  role: Role;
  activeMode: Mode;
  identityVerified: boolean;
  highTrustApproved: boolean;
  rating: number | null;
  reviewCount: number;
  completedJobs: number;
};

export type Category = { id: number; slug: string; name: string; tier: Tier; openJobs: number };
export type Skill = { id: number; slug: string; name: string; categoryId: number | null };

export type EligibilityCode = "inactive" | "skill_required" | "identity_required" | "high_trust_required";
export type Eligibility = { eligible: boolean; code?: EligibilityCode; reason?: string };
export type SkillTag = { slug: string; name: string };

export type JobSummary = {
  id: string;
  title: string;
  description: string;
  status: JobStatus;
  tier: Tier;
  category: { id: number; slug: string; name: string };
  employer: { username: string; employerType: EmployerType; businessName: string | null };
  area: string;
  landmark: string;
  startsAt: string | null;
  endsAt: string | null;
  payType: PayType;
  payMin: number | null;
  payMax: number | null;
  negotiable: boolean;
  paymentTerms: string;
  workersNeeded: number;
  applicationDeadline: string | null;
  applicationCount: number;
  createdAt: string;
  publishedAt: string | null;
  isOwner: boolean;
  myApplication: { id: string; status: ApplicationStatus } | null;
  eligibility: Eligibility | null;
};

export type Applicant = {
  id: string;
  status: ApplicationStatus;
  message: string;
  proposedPay: number | null;
  createdAt: string;
  pairingId: string | null;
  worker: {
    id: string;
    username: string;
    rating: number | null;
    reviewCount: number;
    completedJobs: number;
    identityVerified: boolean;
    highTrustApproved: boolean;
    experienceLevel: ExperienceLevel | null;
    area: string;
    skills: SkillTag[];
  };
  job: { id: string; title: string; tier: Tier; status: JobStatus };
};

export type MyApplication = {
  id: string;
  status: ApplicationStatus;
  message: string;
  proposedPay: number | null;
  createdAt: string;
  job: Pick<JobSummary, "id" | "title" | "tier" | "area" | "payType" | "payMin" | "payMax" | "status"> & {
    employerUsername: string;
  };
  pairing: { id: string; status: PairingStatus } | null;
};

export type Pairing = {
  id: string;
  status: PairingStatus;
  paymentStatus: "not_required" | "pending" | "paid" | "refunded";
  myRole: "worker" | "employer";
  job: Pick<
    JobSummary,
    "id" | "title" | "tier" | "area" | "landmark" | "startsAt" | "endsAt" | "payType" | "payMin" | "payMax" | "paymentTerms"
  > & { categoryName: string; categorySlug: string };
  worker: { id: string; username: string };
  employer: { id: string; username: string };
  agreedPay: number | null;
  confirmedAt: string | null;
  startedAt: string | null;
  employerCompletedAt: string | null;
  workerCompletedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  contact: { phone: string } | null;
  myReview: { overall: number; body: string } | null;
  theirReview: { overall: number; body: string } | null;
  rebooking: { id: string; status: string } | null;
};

export type Rebooking = {
  id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
  originalPairingId: string;
  newPairingId: string | null;
  job: Pick<JobSummary, "id" | "title" | "area" | "startsAt" | "payType" | "payMin" | "payMax">;
  worker: { username: string };
  employer: { username: string };
  direction: "incoming" | "outgoing";
};

export type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type BlockedUser = { username: string; createdAt: string };

export type PublicProfile = {
  id: string;
  username: string;
  /** True when the signed-in viewer has blocked this user. */
  blockedByMe: boolean;
  memberSince: string;
  identityVerified: boolean;
  highTrustApproved: boolean;
  rating: number | null;
  reviewCount: number;
  completedJobs: number;
  worker: {
    bio: string;
    experienceLevel: ExperienceLevel;
    availability: string;
    area: string;
    skills: SkillTag[];
  } | null;
  employer: { employerType: EmployerType; businessName: string | null; area: string } | null;
  reviews: { overall: number; body: string; reviewer: string; createdAt: string }[];
};

export type VerificationRecord = {
  id: string;
  kind: VerificationKind;
  note: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type PublicStats = { workers: number; employers: number; openJobs: number; completedJobs: number };
