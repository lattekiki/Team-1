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
export const TICKET_CATEGORIES = ["account", "job", "pairing", "payment", "safety", "other"] as const;
export const TICKET_STATUSES = ["open", "waiting_staff", "waiting_user", "resolved", "closed"] as const;

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
export const CONTACT_VISIBLE_PAIRING_STATUSES = ["confirmed", "in_progress", "completed", "disputed"] as const;
export const PAYMENT_STATUSES = ["not_required", "pending", "held", "paid", "refunded", "failed"] as const;
export const PAYMENTS_MODES = ["off", "manual", "mock_escrow", "chapa"] as const;
/** Explainable matching reasons (never a substitute for tier eligibility). */
export const MATCH_REASONS = ["skill", "same_area", "nearby", "similar_work", "open_in_area"] as const;

export const JIMMA_AREAS = [
  { id: "Kochi", am: "ኮቺ" },
  { id: "Merkato", am: "መርካቶ" },
  { id: "Bosa Kitto", am: "ቦሳ ኪቶ" },
  { id: "JU Campus", am: "ዩኒቨርሲቲ" },
  { id: "Hermata", am: "ሄርማታ" },
  { id: "Awetu", am: "አዌቱ" },
  { id: "Ginjo", am: "ጊንጆ" },
] as const;

/** Approximate neighborhood centers for distance filters (no map provider). */
export const JIMMA_AREA_COORDS: Record<(typeof JIMMA_AREAS)[number]["id"], { lat: number; lng: number }> = {
  Kochi: { lat: 7.69, lng: 36.82 },
  Merkato: { lat: 7.678, lng: 36.84 },
  "Bosa Kitto": { lat: 7.66, lng: 36.85 },
  "JU Campus": { lat: 7.68, lng: 36.86 },
  Hermata: { lat: 7.67, lng: 36.825 },
  Awetu: { lat: 7.665, lng: 36.815 },
  Ginjo: { lat: 7.655, lng: 36.83 },
};

export const NEAR_RADIUS_KM = [3, 5, 10, 20] as const;
/** Completed jobs before a worker is invited to request VIP (admin still decides). */
export const ACTIVE_WORKER_JOBS = 30;
export const ORG_MONTHLY_ETB = 5000;
export const INQUIRY_STATUSES = ["new", "in_talks", "agreed", "closed"] as const;

export function coordsForArea(area: string): { lat: number; lng: number } | null {
  return (JIMMA_AREA_COORDS as Record<string, { lat: number; lng: number }>)[area] ?? null;
}

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
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentsMode = (typeof PAYMENTS_MODES)[number];
export type MatchReason = (typeof MATCH_REASONS)[number];
export type JobMatch = {
  score: number;
  reasons: MatchReason[];
  /** One-line why this is a fit (rules or LLM). */
  blurb?: string;
};
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

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
  /** Optional Chapa / bank payout destination when PAYMENTS_MODE=chapa. */
  payoutAccountName: z.string().trim().max(120).default(""),
  payoutAccountNumber: z.string().trim().max(40).default(""),
  payoutBankCode: z.coerce.number().int().positive().nullish(),
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
export const inquiryCreateSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  email: z.string().trim().email().or(z.literal("")).default(""),
  message: z.string().trim().min(10).max(2000),
  workersNeeded: z.coerce.number().int().min(1).max(500).default(1),
});

export const inquiryStatusSchema = z.object({
  status: z.enum(INQUIRY_STATUSES),
});

export const jobSuggestSchema = z.object({
  title: z.string().trim().max(120).default(""),
  description: z.string().trim().max(4000).default(""),
});

export const ASSIST_KINDS = ["job_description", "apply_message"] as const;
export type AssistKind = (typeof ASSIST_KINDS)[number];
export const assistRequestSchema = z.object({
  kind: z.enum(ASSIST_KINDS),
  title: z.string().trim().max(120).default(""),
  description: z.string().trim().max(4000).default(""),
  area: z.string().trim().max(80).default(""),
  categoryName: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(2000).default(""),
  /** When applying, the job being applied to (loads title/area server-side). */
  jobId: z.string().uuid().optional(),
});

const shiftSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: optionalDate,
  })
  .refine((s) => !s.startsAt || !s.endsAt || s.endsAt > s.startsAt, {
    message: "End time must be after start time",
    path: ["endsAt"],
  });

/** One template job posted once per shift (business bulk hiring). */
export const jobBulkCreateSchema = jobChecks(
  jobFields.extend({
    publish: z.boolean().default(true),
    shifts: z.array(shiftSchema).min(2).max(14),
  }),
);

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
  /** Center neighborhood for radius search (Jimma area id). */
  near: z.string().trim().max(80).optional(),
  radiusKm: z.coerce.number().min(1).max(50).optional(),
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

export const disputeCreateSchema = z.object({
  reason: z.string().trim().min(5, "Describe what went wrong").max(2000),
});

export const disputeResolveSchema = z.object({
  resolution: z.enum(["resume", "cancel"]),
  note: z.string().trim().max(1000).optional(),
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

export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  category: z.enum(TICKET_CATEGORIES),
  body: z.string().trim().min(5, "Describe your issue").max(4000),
});

export const ticketMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const ticketResolveSchema = z.object({
  status: z.enum(["resolved", "closed"]),
  note: z.string().trim().max(1000).optional(),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(10).max(512),
    auth: z.string().min(8).max(256),
  }),
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
  /** Approximate map pin (job coords or Jimma neighborhood center). */
  lat: number | null;
  lng: number | null;
  startsAt: string | null;
  endsAt: string | null;
  payType: PayType;
  payMin: number | null;
  payMax: number | null;
  negotiable: boolean;
  paymentTerms: string;
  workersNeeded: number;
  /** Pairings that still hold a seat (pending confirm through completed). */
  filledSlots: number;
  applicationDeadline: string | null;
  applicationCount: number;
  createdAt: string;
  publishedAt: string | null;
  isOwner: boolean;
  myApplication: { id: string; status: ApplicationStatus } | null;
  eligibility: Eligibility | null;
  /** True when the signed-in viewer has saved this job. */
  saved: boolean;
  /** Present on recommended-job lists. */
  match?: JobMatch;
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
  job: {
    id: string;
    title: string;
    tier: Tier;
    status: JobStatus;
    workersNeeded: number;
    filledSlots: number;
    categoryId?: number;
  };
  /** Fit hints for the employer — never hides zero-review workers. */
  match?: JobMatch;
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
  paymentStatus: PaymentStatus;
  paymentAmountEtb: number | null;
  paymentHeldAt: string | null;
  paymentPaidAt: string | null;
  /** Hosted checkout URL while payment is still pending (Chapa). */
  paymentCheckoutUrl: string | null;
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
  dispute: {
    id: string;
    reason: string;
    status: "open" | "resolved_resume" | "resolved_cancel";
    openedByMe: boolean;
    openedAt: string;
    resolutionNote: string | null;
  } | null;
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

export type SupportTicketMessage = {
  id: string;
  body: string;
  createdAt: string;
  author: { username: string; isStaff: boolean; isMe: boolean };
};

export type SupportTicketSummary = {
  id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  username?: string;
  messageCount: number;
  lastMessagePreview: string | null;
};

export type SupportTicket = SupportTicketSummary & {
  messages: SupportTicketMessage[];
};

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

export type VerificationDocument = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type VerificationRecord = {
  id: string;
  kind: VerificationKind;
  note: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  documents: VerificationDocument[];
};

export type PublicStats = { workers: number; employers: number; openJobs: number; completedJobs: number };
