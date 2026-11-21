import {
  JIMMA_AREAS,
  type ApplicationStatus,
  type Eligibility,
  type EmployerType,
  type ExperienceLevel,
  type JobStatus,
  type Language,
  type Notification,
  type PairingStatus,
  type PayType,
  type Role,
  type Tier,
  type VerificationKind,
} from "@team1/shared";
import type { Translate, TranslateDynamic, TranslatePlural } from "./i18n.tsx";
import { en } from "./locales/en.ts";

// Month and weekday names for languages where browser Intl support is missing or inconsistent.
const CALENDAR: Record<Exclude<Language, "en">, { months: string[]; days: string[] }> = {
  om: {
    months: ["Ama", "Gur", "Bit", "Elb", "Cam", "Wax", "Ado", "Hag", "Ful", "Onk", "Sad", "Mud"],
    days: ["Dil", "Wix", "Qib", "Rob", "Kam", "Jim", "San"],
  },
  am: {
    months: ["ጃንዩ", "ፌብሩ", "ማርች", "ኤፕሪ", "ሜይ", "ጁን", "ጁላይ", "ኦገስ", "ሴፕቴ", "ኦክቶ", "ኖቬም", "ዲሴም"],
    days: ["እሑድ", "ሰኞ", "ማክሰ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"],
  },
};

const etb = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const enDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const enTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const enDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const pad = (n: number) => String(n).padStart(2, "0");

// Canonical English payment terms are stored on jobs; other languages translate them on display.
export const PAYMENT_TERM_KEYS = ["terms_completion", "terms_daily", "terms_half", "terms_weekly"] as const;

export function makeFormatters(lang: Language, { t, tp, tx }: { t: Translate; tp: TranslatePlural; tx: TranslateDynamic }) {
  const cal = lang === "en" ? null : CALENDAR[lang];
  const day = (d: Date) => (cal ? `${cal.days[d.getDay()]}, ${cal.months[d.getMonth()]} ${d.getDate()}` : enDay.format(d));
  const time = (d: Date) => (cal ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : enTime.format(d));
  const date = (iso: string) => {
    const d = new Date(iso);
    return cal ? `${cal.months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : enDate.format(d);
  };

  const fmt = {
    date,
    tier: (tier: Tier) => t(`tier_${tier}`),
    payType: (p: PayType) => t(`payType_${p}`),
    jobStatus: (s: JobStatus) => t(`jobStatus_${s}`),
    appStatus: (s: ApplicationStatus) => t(`appStatus_${s}`),
    pairingStatus: (s: PairingStatus) => t(`pairingStatus_${s}`),
    employerType: (e: EmployerType) => t(`employerType_${e}`),
    experience: (e: ExperienceLevel) => t(`experience_${e}`),
    verifKind: (k: VerificationKind) => t(`verifKind_${k}`),
    verifStatus: (s: string) => tx(`verifStatus_${s}`, s),
    reportStatus: (s: string) => tx(`reportStatus_${s}`, s),
    reportTarget: (s: string) => tx(`reportTarget_${s}`, s),
    role: (r: Role) => t(`role_${r}`),
    category: (slug: string, fallback: string) => tx(`cat_${slug}`, fallback),
    skill: (slug: string, fallback: string) => tx(`skill_${slug}`, fallback),
    area: (id: string) => (lang === "am" ? (JIMMA_AREAS.find((a) => a.id === id)?.am ?? id) : id),
    audit: (action: string) => tx(`audit_${action.replace(/\./g, "_")}`, action),
    eligibility: (e: Eligibility) => (e.code ? t(`elig_${e.code}`) : (e.reason ?? "")),

    paymentTerms(text: string) {
      const key = PAYMENT_TERM_KEYS.find((k) => en[k] === text);
      return key ? t(key) : text;
    },

    pay(job: { payMin: number | null; payMax: number | null; payType: PayType }) {
      const { payMin, payMax } = job;
      if (payMin == null && payMax == null) return job.payType === "negotiable" ? t("payNegotiable") : t("payOnRequest");
      if (payMin != null && payMax != null && payMin !== payMax) {
        return t("payRange", { min: etb.format(payMin), max: etb.format(payMax) });
      }
      return t("payAmount", { amount: etb.format((payMax ?? payMin) as number) });
    },

    schedule(startsAt: string | null, endsAt: string | null) {
      if (!startsAt) return t("scheduleFlexible");
      const start = new Date(startsAt);
      const label = `${day(start)} • ${time(start)}`;
      if (!endsAt) return label;
      const end = new Date(endsAt);
      return start.toDateString() === end.toDateString() ? `${label} – ${time(end)}` : `${label} – ${day(end)} ${time(end)}`;
    },

    timeAgo(iso: string) {
      const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
      if (seconds < 60) return t("justNow");
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return t("minutesAgo", { n: minutes });
      const hours = Math.round(minutes / 60);
      if (hours < 24) return tp("hoursAgo", hours);
      const days = Math.round(hours / 24);
      return days < 30 ? tp("daysAgo", days) : date(iso);
    },

    notification(n: Notification): { text: string; href: string | null } {
      const p = n.payload as Record<string, string | number | undefined>;
      const vars = {
        title: p.title ? `“${p.title}”` : t("notifYourJob"),
        worker: String(p.worker ?? ""),
        employer: String(p.employer ?? ""),
        stars: String(p.overall ?? ""),
        kind: p.kind ? fmt.verifKind(p.kind as VerificationKind) : "",
        status: p.kind ? fmt.verifStatus(String(p.status)) : fmt.reportStatus(String(p.status ?? "")),
      };
      const pairing = p.pairingId ? `/pairings/${p.pairingId}` : null;
      const job = p.jobId ? `/jobs/${p.jobId}` : null;
      const href: Record<string, string | null> = {
        application_received: job,
        not_selected: job,
        job_cancelled: job,
        rebook_request: "/dashboard",
        rebook_declined: "/dashboard",
        verification_updated: "/profile",
        report_updated: null,
      };
      return {
        text: tx(`notif_${n.type}`, t("notif_unknown"), vars),
        href: n.type in href ? (href[n.type] ?? null) : pairing,
      };
    },
  };
  return fmt;
}

export type Formatters = ReturnType<typeof makeFormatters>;

export const initials = (username: string | null | undefined) => (username ?? "?").slice(0, 2).toUpperCase();

// Input value for <input type="datetime-local"> from an ISO string, and back.
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
