import { CheckCircle2, ChevronRight, Clock, CreditCard, Lock, MapPin, Users } from "lucide-react";
import { Link, useNavigate } from "react-router";
import type { JobSummary } from "@team1/shared";
import { useAuth } from "../lib/auth.tsx";
import { initials } from "../lib/format.ts";
import { useI18n } from "../lib/i18n.tsx";
import { SaveJobButton } from "./SaveJobButton.tsx";
import { TrustTierBadge } from "./ui.tsx";

export function JobCard({
  job,
  dark = false,
  onApply,
  onSavedChange,
}: {
  job: JobSummary;
  dark?: boolean;
  onApply: (job: JobSummary) => void;
  onSavedChange?: (jobId: string, saved: boolean) => void;
}) {
  const { user } = useAuth();
  const { t, tp, fmt } = useI18n();
  const navigate = useNavigate();
  const muted = dark ? "text-zinc-400" : "text-zinc-500";
  const applied = job.myApplication && job.myApplication.status !== "withdrawn";

  let action;
  if (job.isOwner) {
    action = (
      <Link
        to={`/jobs/${job.id}`}
        className={`text-xs font-bold px-4 py-2 rounded-full ${dark ? "bg-white text-zinc-900" : "bg-zinc-100 text-zinc-900"}`}
      >
        {t("jobManage")}
      </Link>
    );
  } else if (applied) {
    action = (
      <span
        className={`inline-flex items-center gap-1 text-xs font-bold px-3.5 py-2 rounded-full ${dark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        {t("applied")}
      </span>
    );
  } else if (job.eligibility && !job.eligibility.eligible) {
    action = (
      <span title={fmt.eligibility(job.eligibility)} className={`inline-flex items-center gap-1 text-[11px] font-bold ${muted}`}>
        <Lock className="w-3.5 h-3.5" />
        {job.tier === "vip" ? t("lockVip") : t("lockSkill")}
      </span>
    );
  } else {
    action = (
      <button
        onClick={() => (user ? onApply(job) : navigate(`/login?next=/jobs/${job.id}`))}
        className={`inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full transition-all ${
          dark ? "bg-white text-zinc-900 hover:bg-zinc-100" : "bg-zinc-900 text-white hover:bg-zinc-800"
        }`}
      >
        {t("applyNow")}
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div
      className={`rounded-3xl p-6 border transition-all duration-200 flex flex-col justify-between ${
        dark
          ? "bg-zinc-900 text-white border-zinc-900 shadow-2xl"
          : "bg-white text-zinc-900 border-zinc-200/90 hover:border-zinc-900 hover:shadow-lg"
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <Link to={`/u/${job.employer.username}`} className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${dark ? "bg-white text-zinc-900" : "bg-zinc-100 text-zinc-900"}`}
            >
              {initials(job.employer.businessName ?? job.employer.username)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold leading-tight truncate">@{job.employer.username}</p>
              <p className={`text-[10px] ${muted}`}>{job.employer.businessName ?? fmt.employerType(job.employer.employerType)}</p>
            </div>
          </Link>
          <div className="text-right shrink-0">
            <p className="text-sm font-extrabold">{fmt.pay(job)}</p>
            <p className={`text-[10px] font-medium ${muted}`}>{fmt.payType(job.payType)}</p>
          </div>
        </div>

        <Link to={`/jobs/${job.id}`}>
          <h3 className="text-lg font-extrabold tracking-tight mt-4 leading-snug hover:underline">{job.title}</h3>
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <TrustTierBadge tier={job.tier} dark={dark} />
          {job.negotiable && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${dark ? "bg-white/15 text-amber-300" : "bg-zinc-100 text-zinc-800"}`}>
              {t("negotiablePay")}
            </span>
          )}
          {job.match?.reasons.map((reason) => (
            <span
              key={reason}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${dark ? "bg-emerald-500/20 text-emerald-200" : "bg-emerald-50 text-emerald-800"}`}
            >
              {t(`match_${reason}` as "match_skill")}
            </span>
          ))}
        </div>

        <div className={`mt-4 space-y-1.5 text-xs ${dark ? "text-zinc-300" : "text-zinc-600"}`}>
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 shrink-0 opacity-75" />
            <span>
              <strong>{fmt.area(job.area)}</strong>
              {job.landmark && ` • ${job.landmark}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 shrink-0 opacity-75" />
            <span>{fmt.schedule(job.startsAt, job.endsAt)}</span>
          </div>
          {job.paymentTerms && (
            <div className="flex items-start gap-2 pt-0.5">
              <CreditCard className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-75" />
              <span className="text-[11px] leading-snug">{fmt.paymentTerms(job.paymentTerms)}</span>
            </div>
          )}
          {(job.workersNeeded > 1 || job.filledSlots > 0) && (
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 shrink-0 opacity-75" />
              <span>{t("slotsFilled", { filled: job.filledSlots, needed: job.workersNeeded })}</span>
            </div>
          )}
        </div>

        {job.description && (
          <p className={`mt-4 text-xs line-clamp-2 ${dark ? "text-zinc-300" : "text-zinc-500"}`}>{job.description}</p>
        )}
      </div>

      <div className={`mt-5 pt-4 border-t flex items-center justify-between gap-2 ${dark ? "border-zinc-800" : "border-zinc-100"}`}>
        <span className="text-[11px] text-zinc-400">
          {tp("applicants", job.applicationCount)}
          {job.publishedAt && ` • ${fmt.timeAgo(job.publishedAt)}`}
        </span>
        <div className="flex items-center gap-2">
          {!job.isOwner && (
            <SaveJobButton
              jobId={job.id}
              saved={job.saved}
              dark={dark}
              onChanged={(saved) => onSavedChange?.(job.id, saved)}
            />
          )}
          {action}
        </div>
      </div>
    </div>
  );
}
