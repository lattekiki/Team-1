import type { Notification, PairingStatus, PayType, Tier } from "@team1/shared";

export const TIER_LABEL: Record<Tier, string> = {
  vip: "Tier 1: VIP",
  skilled: "Tier 2: Skilled",
  ordinary: "Tier 3: Ordinary",
};

export const PAY_TYPE_LABEL: Record<PayType, string> = {
  hourly: "Hourly",
  daily: "Daily",
  fixed: "Fixed task",
  recurring: "Recurring",
  negotiable: "Negotiable",
};

export const PAIRING_STATUS_LABEL: Record<PairingStatus, string> = {
  pending_confirmation: "Awaiting worker confirmation",
  confirmed: "Paired & confirmed",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

const etb = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatPay(job: { payMin: number | null; payMax: number | null; payType: PayType }) {
  const { payMin, payMax } = job;
  if (payMin == null && payMax == null) return job.payType === "negotiable" ? "Negotiable" : "Pay on request";
  if (payMin != null && payMax != null && payMin !== payMax) return `${etb.format(payMin)}–${etb.format(payMax)} ETB`;
  return `${etb.format((payMax ?? payMin) as number)} ETB`;
}

const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function formatSchedule(startsAt: string | null, endsAt: string | null) {
  if (!startsAt) return "Flexible schedule";
  const start = new Date(startsAt);
  const label = `${dayFmt.format(start)} • ${timeFmt.format(start)}`;
  if (!endsAt) return label;
  const end = new Date(endsAt);
  return start.toDateString() === end.toDateString()
    ? `${label} – ${timeFmt.format(end)}`
    : `${label} – ${dayFmt.format(end)} ${timeFmt.format(end)}`;
}

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export function timeAgo(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} day${days === 1 ? "" : "s"} ago` : formatDate(iso);
}

export const initials = (username: string | null | undefined) => (username ?? "?").slice(0, 2).toUpperCase();

// Input value for <input type="datetime-local"> from an ISO string, and back.
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

export function describeNotification(n: Notification): { text: string; href: string | null } {
  const p = n.payload as Record<string, string | number | undefined>;
  const title = p.title ? `“${p.title}”` : "your job";
  const pairing = p.pairingId ? `/pairings/${p.pairingId}` : null;
  const job = p.jobId ? `/jobs/${p.jobId}` : null;
  switch (n.type) {
    case "application_received":
      return { text: `@${p.worker} applied to ${title}`, href: job };
    case "selected":
      return { text: `You were selected for ${title}. Confirm to unlock contact details.`, href: pairing };
    case "not_selected":
      return { text: `The employer chose someone else for ${title}`, href: job };
    case "pairing_confirmed":
      return { text: `@${p.worker} confirmed ${title}. Contact details are unlocked.`, href: pairing };
    case "pairing_declined":
      return { text: `@${p.worker} declined ${title}`, href: pairing };
    case "pairing_cancelled":
      return { text: `${title} was cancelled`, href: pairing };
    case "job_cancelled":
      return { text: `The employer cancelled ${title}`, href: job };
    case "work_started":
      return { text: `Work on ${title} has started`, href: pairing };
    case "completion_requested":
      return { text: `The other side marked ${title} as completed. Please confirm.`, href: pairing };
    case "pairing_completed":
      return { text: `${title} is completed. Leave a review.`, href: pairing };
    case "review_received":
      return { text: `You received a ${p.overall}★ review for ${title}`, href: pairing };
    case "rebook_request":
      return { text: `@${p.employer} wants to rebook you for ${title}`, href: "/dashboard" };
    case "rebook_accepted":
      return { text: `@${p.worker} accepted your rebooking for ${title}`, href: pairing };
    case "rebook_declined":
      return { text: `@${p.worker} declined your rebooking for ${title}`, href: "/dashboard" };
    case "verification_updated":
      return { text: `Your ${String(p.kind).replace("_", "-")} verification was ${p.status}`, href: "/profile" };
    case "report_updated":
      return { text: `Your report was marked ${p.status}`, href: null };
    default:
      return { text: n.type.replace(/_/g, " "), href: null };
  }
}
