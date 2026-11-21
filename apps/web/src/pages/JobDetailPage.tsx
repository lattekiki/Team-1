import { ArrowRight, CheckCircle2, Clock, CreditCard, Lock, MapPin, Pencil, Users, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Applicant, JobSummary } from "@team1/shared";
import { ApplyModal } from "../components/ApplyModal.tsx";
import { ReportButton } from "../components/Modals.tsx";
import { PostJobModal } from "../components/PostJobModal.tsx";
import { btn, container, EmptyState, ErrorBox, Rating, SectionTitle, Spinner, StatusPill, TrustTierBadge } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { initials } from "../lib/format.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";

const STATUS_TONE = { draft: "neutral", published: "good", filled: "dark", cancelled: "bad", expired: "neutral" } as const;

export function ApplicantCard({ applicant, onChanged }: { applicant: Applicant; onChanged: () => void }) {
  const { t, tp, fmt } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { busy, run } = useAction();
  const w = applicant.worker;
  const onError = (m: string) => toast(m, "error");

  const select = async () => {
    const res = await run(() => api<{ pairingId: string }>(`/applications/${applicant.id}/select`, { method: "POST" }), onError);
    if (res) {
      toast(t("toastSelected", { username: w.username }));
      navigate(`/pairings/${res.pairingId}`);
    }
  };
  const reject = async () => {
    const ok = await run(() => api(`/applications/${applicant.id}/reject`, { method: "POST" }), onError);
    if (ok) {
      toast(t("toastRejected", { username: w.username }));
      onChanged();
    }
  };

  return (
    <div className="p-5 rounded-3xl border bg-white border-zinc-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center font-extrabold text-sm shrink-0">
            {initials(w.username)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/u/${w.username}`} className="font-bold text-base hover:underline">
                @{w.username}
              </Link>
              <Rating value={w.rating} count={w.reviewCount} />
              {w.identityVerified && <StatusPill tone="good">{t("badgeIdVerified")}</StatusPill>}
              {w.highTrustApproved && <StatusPill tone="warn">{t("badgeVipApproved")}</StatusPill>}
            </div>
            <p className="text-xs mt-1 text-zinc-500">
              {tp("completedJobs", w.completedJobs)}
              {w.area && ` • ${fmt.area(w.area)}`}
              {w.experienceLevel && ` • ${fmt.experience(w.experienceLevel)}`} •{" "}
              <strong>{t("applicantFor", { title: applicant.job.title })}</strong>
            </p>
          </div>
        </div>
        <StatusPill tone={applicant.status === "selected" ? "good" : applicant.status === "rejected" ? "bad" : "warn"}>
          {applicant.status === "pending" ? t("applicantNew") : fmt.appStatus(applicant.status)}
        </StatusPill>
      </div>

      <p className="text-sm mt-3.5 leading-relaxed text-zinc-600">“{applicant.message}”</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {applicant.proposedPay != null && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900">
            {t("applicantProposes", { amount: applicant.proposedPay.toLocaleString("en-US") })}
          </span>
        )}
        {w.skills.map((s) => (
          <span key={s.slug} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800">
            ✓ {fmt.skill(s.slug, s.name)}
          </span>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
          <Lock className="w-4 h-4 text-zinc-400" />
          {t("applicantPhoneHidden", { username: w.username })}
        </span>
        <div className="flex items-center gap-2">
          {applicant.status === "pending" && (
            <>
              <button onClick={reject} disabled={busy} className={btn.ghost}>
                <X className="w-3.5 h-3.5" />
                {t("applicantReject")}
              </button>
              <button onClick={select} disabled={busy} className={btn.primary}>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {t("applicantSelect")}
              </button>
            </>
          )}
          {applicant.pairingId && (
            <Link to={`/pairings/${applicant.pairingId}`} className={btn.light}>
              {t("viewPairing")}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function JobDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, tp, fmt } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { busy, run } = useAction();
  const [applying, setApplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const job = useApi<{ job: JobSummary }>(`/jobs/${id}`);
  const isOwner = job.data?.job.isOwner ?? false;
  const applicants = useApi<{ applicants: Applicant[] }>(isOwner ? `/jobs/${id}/applications` : null);

  if (job.loading && !job.data) return <Spinner />;
  if (job.error || !job.data) {
    return (
      <div className={`${container} py-16`}>
        <ErrorBox message={job.error?.message ?? t("jobNotFound")} />
      </div>
    );
  }
  const j = job.data.job;
  const applied = j.myApplication && j.myApplication.status !== "withdrawn";

  const action = async (path: string, message: string) => {
    const ok = await run(() => api(path, { method: "POST" }), (m) => toast(m, "error"));
    if (ok) {
      toast(message);
      job.reload();
    }
  };

  return (
    <section className="py-12">
      <div className={`${container} grid grid-cols-1 lg:grid-cols-3 gap-8`}>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <TrustTierBadge tier={j.tier} />
              <StatusPill tone={STATUS_TONE[j.status]}>{fmt.jobStatus(j.status)}</StatusPill>
              {j.negotiable && <StatusPill>{t("negotiablePay")}</StatusPill>}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight mt-4">{j.title}</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {fmt.category(j.category.slug, j.category.name)} • {t("postedBy")}{" "}
              <Link to={`/u/${j.employer.username}`} className="font-semibold text-zinc-800 hover:underline">
                @{j.employer.username}
              </Link>
              {j.publishedAt && ` • ${fmt.timeAgo(j.publishedAt)}`}
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("payLabel")}</p>
                <p className="font-extrabold text-lg">{fmt.pay(j)}</p>
                <p className="text-xs text-zinc-500">{fmt.payType(j.payType)}</p>
              </div>
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 space-y-1.5 text-xs text-zinc-700">
                <p className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" />
                  <strong>{fmt.area(j.area)}</strong>
                  {j.landmark && ` • ${j.landmark}`}
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  {fmt.schedule(j.startsAt, j.endsAt)}
                </p>
                {j.paymentTerms && (
                  <p className="flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5" />
                    {fmt.paymentTerms(j.paymentTerms)}
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  {tp("workersNeeded", j.workersNeeded)}
                </p>
              </div>
            </div>

            {j.description && <p className="mt-6 text-sm leading-relaxed text-zinc-700 whitespace-pre-line">{j.description}</p>}
          </div>

          {isOwner && (
            <div className="space-y-4">
              <SectionTitle icon={Users} aside={<span className="text-xs text-zinc-500">{t("privacyNote")}</span>}>
                {t("jobApplicants")}
              </SectionTitle>
              {applicants.loading && !applicants.data ? (
                <Spinner />
              ) : applicants.data?.applicants.length ? (
                applicants.data.applicants.map((a) => (
                  <ApplicantCard key={a.id} applicant={a} onChanged={applicants.reload} />
                ))
              ) : (
                <EmptyState icon={Users} title={t("noApplicants")}>
                  {t("noApplicantsHint")}
                </EmptyState>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="bg-zinc-900 text-white rounded-3xl p-6 space-y-4">
            {isOwner ? (
              <>
                <p className="text-sm font-bold">{t("yourJobPost")}</p>
                <p className="text-xs text-zinc-400">{tp("applicants", j.applicationCount)}</p>
                <div className="flex flex-wrap gap-2">
                  {j.status === "draft" && (
                    <button disabled={busy} onClick={() => action(`/jobs/${j.id}/publish`, t("toastPublished"))} className={btn.light}>
                      {t("publish")}
                    </button>
                  )}
                  {(j.status === "draft" || j.status === "published") && (
                    <button onClick={() => setEditing(true)} className={btn.light}>
                      <Pencil className="w-3.5 h-3.5" />
                      {t("edit")}
                    </button>
                  )}
                  {!["cancelled", "expired"].includes(j.status) && (
                    <button
                      disabled={busy}
                      onClick={() => confirm(t("confirmCancelJob")) && action(`/jobs/${j.id}/cancel`, t("toastJobCancelled"))}
                      className={btn.danger}
                    >
                      {t("cancelJob")}
                    </button>
                  )}
                </div>
              </>
            ) : applied ? (
              <>
                <p className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  {t("youApplied", { status: fmt.appStatus(j.myApplication!.status) })}
                </p>
                {j.myApplication!.status === "pending" && (
                  <button
                    disabled={busy}
                    onClick={() => action(`/applications/${j.myApplication!.id}/withdraw`, t("toastWithdrawn"))}
                    className={btn.light}
                  >
                    {t("withdraw")}
                  </button>
                )}
                <Link to="/dashboard" className="block text-xs underline text-zinc-300">
                  {t("trackActivity")}
                </Link>
              </>
            ) : j.eligibility && !j.eligibility.eligible ? (
              <>
                <p className="flex items-center gap-2 text-sm font-bold text-amber-300">
                  <Lock className="w-4 h-4" />
                  {t("notEligible")}
                </p>
                <p className="text-xs text-zinc-300">{fmt.eligibility(j.eligibility)}</p>
                <Link to="/profile" className={btn.light}>
                  {t("updateProfileVerification")}
                </Link>
              </>
            ) : j.status === "published" ? (
              <>
                <p className="text-sm font-bold">{t("interested")}</p>
                <p className="text-xs text-zinc-400">{t("interestedHint")}</p>
                <button
                  onClick={() => (user ? setApplying(true) : navigate(`/login?next=/jobs/${j.id}`))}
                  className="w-full py-3 rounded-2xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs"
                >
                  {t("applyNow")}
                </button>
              </>
            ) : (
              <p className="text-sm text-zinc-300">{t("jobClosedNote")}</p>
            )}
          </div>
          {user && !isOwner && <ReportButton targetType="job" targetId={j.id} label={t("reportJob")} />}
        </aside>
      </div>

      {applying && <ApplyModal job={j} onClose={() => setApplying(false)} onApplied={job.reload} />}
      {editing && <PostJobModal job={j} onClose={() => setEditing(false)} onSaved={() => job.reload()} />}
    </section>
  );
}
