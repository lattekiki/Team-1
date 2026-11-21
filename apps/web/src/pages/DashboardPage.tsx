import {
  ArrowRight,
  Award,
  Bookmark,
  Briefcase,
  CheckCircle2,
  Circle,
  ClipboardList,
  Lock,
  Phone,
  PlusCircle,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import type { Applicant, JobSummary, Me, MyApplication, Pairing, Rebooking } from "@team1/shared";
import { ApplyModal } from "../components/ApplyModal.tsx";
import { JobCard } from "../components/JobCard.tsx";
import { RebookModal } from "../components/Modals.tsx";
import { PostJobModal } from "../components/PostJobModal.tsx";
import { btn, container, EmptyState, Rating, SectionTitle, Spinner, StatusPill, TrustTierBadge } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useI18n } from "../lib/i18n.tsx";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";
import { ApplicantCard } from "./JobDetailPage.tsx";

const ACTIVE_PAIRING = ["pending_confirmation", "confirmed", "in_progress"];

function PairingRow({ pairing }: { pairing: Pairing }) {
  const { t, fmt } = useI18n();
  const other = pairing.myRole === "worker" ? pairing.employer : pairing.worker;
  const needsMe =
    (pairing.status === "pending_confirmation" && pairing.myRole === "worker") ||
    (pairing.status === "completed" && !pairing.myReview);
  return (
    <Link
      to={`/pairings/${pairing.id}`}
      className={`block p-5 rounded-3xl border transition-all ${
        pairing.contact ? "bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800" : "bg-white border-zinc-200 hover:border-zinc-400"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">{pairing.job.title}</p>
          <p className={`text-xs mt-0.5 ${pairing.contact ? "text-zinc-400" : "text-zinc-500"}`}>
            {t("withUser", { username: other.username })} • {fmt.area(pairing.job.area)} •{" "}
            {fmt.schedule(pairing.job.startsAt, pairing.job.endsAt)}
          </p>
        </div>
        <StatusPill tone={pairing.contact ? "dark" : needsMe ? "warn" : "neutral"}>
          {needsMe ? (pairing.status === "completed" ? t("leaveReview") : t("needsConfirm")) : fmt.pairingStatus(pairing.status)}
        </StatusPill>
      </div>
      <p className={`mt-3 flex items-center gap-2 text-xs font-semibold ${pairing.contact ? "text-emerald-300" : "text-zinc-500"}`}>
        {pairing.contact ? (
          <>
            <Phone className="w-3.5 h-3.5" />
            {pairing.contact.phone}
          </>
        ) : (
          <>
            <Lock className="w-3.5 h-3.5" />
            {t("contactHiddenShort")}
          </>
        )}
      </p>
    </Link>
  );
}

function ProgressionCard({ done, title, children, action }: { done: boolean; title: string; children: string; action?: ReactNode }) {
  return (
    <div className={`p-5 rounded-2xl border ${done ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10"}`}>
      <p className="flex items-center gap-2 text-sm font-bold">
        {done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-zinc-500" />}
        {title}
      </p>
      <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function ReputationBanner({ user, hasSkills }: { user: Me; hasSkills: boolean }) {
  const { t, tp } = useI18n();
  return (
    <div className="bg-zinc-900 text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("workerDashTitle")}</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold mt-1">@{user.username}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Rating value={user.rating} count={user.reviewCount} dark />
            <span className="text-xs text-zinc-300">{tp("completedJobs", user.completedJobs)}</span>
            {user.identityVerified && <StatusPill tone="dark">{t("badgeIdVerified")}</StatusPill>}
            {user.highTrustApproved && <StatusPill tone="dark">{t("badgeVipApproved")}</StatusPill>}
          </div>
        </div>
        <Link to="/profile" className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-white text-zinc-900 text-xs font-bold">
          {t("editProfileSkills")}
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <ProgressionCard done title={t("tier3Title")}>
          {t("tier3Desc")}
        </ProgressionCard>
        <ProgressionCard done={hasSkills} title={t("tier2Title")}>
          {t("tier2Desc")}
        </ProgressionCard>
        <ProgressionCard done={user.identityVerified && user.highTrustApproved} title={t("tier1Title")}>
          {t("tier1Desc")}
        </ProgressionCard>
      </div>
    </div>
  );
}

function RebookRequest({ rebooking, onChanged }: { rebooking: Rebooking; onChanged: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { busy, run } = useAction();
  const onError = (m: string) => toast(m, "error");
  const accept = async () => {
    const res = await run(() => api<{ pairingId: string }>(`/rebookings/${rebooking.id}/accept`, { method: "POST" }), onError);
    if (res) {
      toast(t("toastRebookAccepted"));
      navigate(`/pairings/${res.pairingId}`);
    }
  };
  const decline = async () => {
    if (await run(() => api(`/rebookings/${rebooking.id}/decline`, { method: "POST" }), onError)) {
      toast(t("toastRebookDeclined"));
      onChanged();
    }
  };
  return (
    <div className="p-5 rounded-3xl border border-amber-200 bg-amber-50/60">
      <p className="text-sm font-bold">
        {t("rebookRequestTitle", { username: rebooking.employer.username, title: rebooking.job.title })}
      </p>
      <p className="text-xs text-zinc-600 mt-1">
        {fmt.area(rebooking.job.area)} • {fmt.schedule(rebooking.job.startsAt, null)} • {fmt.pay(rebooking.job)}
      </p>
      <div className="mt-3 flex gap-2">
        <button disabled={busy} onClick={accept} className={btn.primary}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          {t("accept")}
        </button>
        <button disabled={busy} onClick={decline} className={btn.ghost}>
          {t("decline")}
        </button>
      </div>
    </div>
  );
}

function WorkerDashboard({ user }: { user: Me }) {
  const { t, fmt } = useI18n();
  const [applying, setApplying] = useState<JobSummary | null>(null);
  const profile = useApi<{ worker: { skillIds: number[] } | null }>("/me/profile");
  const applications = useApi<{ applications: MyApplication[] }>("/me/applications");
  const pairings = useApi<{ pairings: Pairing[] }>("/me/pairings?role=worker");
  const rebookings = useApi<{ rebookings: Rebooking[] }>("/me/rebookings");
  const favorites = useApi<{ jobs: JobSummary[] }>("/me/favorites");

  const incoming = rebookings.data?.rebookings.filter((r) => r.direction === "incoming" && r.status === "pending") ?? [];
  const pairingList = pairings.data?.pairings ?? [];
  const active = pairingList.filter((p) => ACTIVE_PAIRING.includes(p.status) || (p.status === "completed" && !p.myReview));
  const past = pairingList.filter((p) => !active.includes(p));
  const openApps = applications.data?.applications.filter((a) => !a.pairing) ?? [];
  const savedJobs = favorites.data?.jobs ?? [];

  return (
    <div className="space-y-10">
      <ReputationBanner user={user} hasSkills={(profile.data?.worker?.skillIds.length ?? 0) > 0} />

      {incoming.length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={RefreshCw}>{t("rebookRequests")}</SectionTitle>
          {incoming.map((r) => (
            <RebookRequest key={r.id} rebooking={r} onChanged={rebookings.reload} />
          ))}
        </div>
      )}

      {(favorites.loading || savedJobs.length > 0) && (
        <div className="space-y-3">
          <SectionTitle icon={Bookmark}>{t("savedJobsTitle")}</SectionTitle>
          {favorites.loading && !favorites.data ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onApply={setApplying}
                  onSavedChange={(id, saved) => {
                    if (!saved) favorites.reload();
                    else void id;
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <SectionTitle icon={Briefcase}>{t("myPairings")}</SectionTitle>
        {pairings.loading && !pairings.data ? (
          <Spinner />
        ) : active.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {active.map((p) => (
              <PairingRow key={p.id} pairing={p} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Briefcase} title={t("noActiveJobs")}>
            {t("noActiveJobsHint")}
          </EmptyState>
        )}
      </div>

      <div className="space-y-3">
        <SectionTitle
          icon={Send}
          aside={
            <Link to="/jobs" className="text-xs font-bold underline">
              {t("findMoreJobs")}
            </Link>
          }
        >
          {t("myApplications")}
        </SectionTitle>
        {applications.loading && !applications.data ? (
          <Spinner />
        ) : openApps.length ? (
          <div className="bg-white border border-zinc-200 rounded-3xl divide-y divide-zinc-100">
            {openApps.map((a) => (
              <Link key={a.id} to={`/jobs/${a.job.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-zinc-50">
                <div>
                  <p className="text-sm font-bold">{a.job.title}</p>
                  <p className="text-xs text-zinc-500">
                    @{a.job.employerUsername} • {fmt.area(a.job.area)} • {fmt.pay(a.job)} •{" "}
                    {t("appliedAgo", { time: fmt.timeAgo(a.createdAt) })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TrustTierBadge tier={a.job.tier} />
                  <StatusPill tone={a.status === "pending" ? "warn" : a.status === "rejected" ? "bad" : "neutral"}>
                    {fmt.appStatus(a.status)}
                  </StatusPill>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={Send} title={t("noOpenApplications")}>
            <Link to="/jobs" className="underline font-semibold">
              {t("noOpenApplicationsHint")}
            </Link>
          </EmptyState>
        )}
      </div>

      {past.length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={Award}>{t("pastJobs")}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {past.map((p) => (
              <PairingRow key={p.id} pairing={p} />
            ))}
          </div>
        </div>
      )}

      {applying && (
        <ApplyModal
          job={applying}
          onClose={() => setApplying(null)}
          onApplied={() => {
            setApplying(null);
            applications.reload();
            favorites.reload();
          }}
        />
      )}
    </div>
  );
}

function EmployerDashboard() {
  const { t, tp, fmt } = useI18n();
  const navigate = useNavigate();
  const [posting, setPosting] = useState(false);
  const [rebookFor, setRebookFor] = useState<Pairing | null>(null);
  const jobs = useApi<{ jobs: JobSummary[] }>("/me/jobs");
  const applicants = useApi<{ applicants: Applicant[] }>("/me/applicants");
  const pairings = useApi<{ pairings: Pairing[] }>("/me/pairings?role=employer");

  const pending = applicants.data?.applicants.filter((a) => a.status === "pending") ?? [];
  const pairingList = pairings.data?.pairings ?? [];
  const active = pairingList.filter((p) => ACTIVE_PAIRING.includes(p.status));
  const completed = pairingList.filter((p) => p.status === "completed");

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t("employerDashTitle")}</h2>
          <p className="text-sm text-zinc-500 mt-1">{t("employerDashSub")}</p>
        </div>
        <button onClick={() => setPosting(true)} className={`${btn.primary} py-3 px-5`}>
          <PlusCircle className="w-4 h-4" />
          {t("postJobBtn")}
        </button>
      </div>

      <div className="space-y-3">
        <SectionTitle icon={ClipboardList}>{t("myJobsTitle")}</SectionTitle>
        {jobs.loading && !jobs.data ? (
          <Spinner />
        ) : jobs.data?.jobs.length ? (
          <div className="bg-white border border-zinc-200 rounded-3xl divide-y divide-zinc-100">
            {jobs.data.jobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-zinc-50">
                <div>
                  <p className="text-sm font-bold">{j.title}</p>
                  <p className="text-xs text-zinc-500">
                    {fmt.category(j.category.slug, j.category.name)} • {fmt.area(j.area)} • {fmt.pay(j)} •{" "}
                    {tp("applicants", j.applicationCount)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TrustTierBadge tier={j.tier} />
                  <StatusPill tone={j.status === "published" ? "good" : j.status === "cancelled" ? "bad" : "neutral"}>
                    {fmt.jobStatus(j.status)}
                  </StatusPill>
                  <ArrowRight className="w-4 h-4 text-zinc-400" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={ClipboardList} title={t("noJobsPosted")}>
            {t("noJobsPostedHint")}
          </EmptyState>
        )}
      </div>

      <div className="space-y-4">
        <SectionTitle icon={Users} aside={<span className="text-xs text-zinc-500">{t("privacyNote")}</span>}>
          {t("applicantsTitle")}
        </SectionTitle>
        {active.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {active.map((p) => (
              <PairingRow key={p.id} pairing={p} />
            ))}
          </div>
        )}
        {applicants.loading && !applicants.data ? (
          <Spinner />
        ) : pending.length ? (
          pending.map((a) => (
            <ApplicantCard
              key={a.id}
              applicant={a}
              onChanged={() => {
                applicants.reload();
                jobs.reload();
              }}
            />
          ))
        ) : (
          active.length === 0 && (
            <EmptyState icon={Users} title={t("noNewApplicants")}>
              {t("noNewApplicantsHint")}
            </EmptyState>
          )
        )}
      </div>

      {completed.length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={RefreshCw}>{t("rebookTitle")}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completed.map((p) => (
              <div key={p.id} className="p-5 rounded-3xl border border-zinc-200 bg-white flex flex-col gap-3">
                <div>
                  <p className="font-bold">@{p.worker.username}</p>
                  <p className="text-xs text-zinc-500">
                    {p.job.title} •{" "}
                    {p.completedAt ? t("completedAgo", { time: fmt.timeAgo(p.completedAt) }) : fmt.pairingStatus("completed")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!p.myReview && (
                    <Link to={`/pairings/${p.id}`} className={btn.light}>
                      {t("leaveReview")}
                    </Link>
                  )}
                  {p.rebooking?.status === "pending" ? (
                    <StatusPill tone="warn">{t("rebookSentPill")}</StatusPill>
                  ) : (
                    <button onClick={() => setRebookFor(p)} className={btn.primary}>
                      <RefreshCw className="w-3.5 h-3.5" />
                      {t("rebookBtn")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {posting && (
        <PostJobModal
          onClose={() => setPosting(false)}
          onSaved={(job) => {
            setPosting(false);
            navigate(`/jobs/${job.id}`);
          }}
        />
      )}
      {rebookFor && <RebookModal pairing={rebookFor} onClose={() => setRebookFor(null)} onDone={pairings.reload} />}
    </div>
  );
}

export function DashboardPage() {
  const { user, setMode } = useAuth();
  const { t } = useI18n();
  if (!user) return null;
  const isEmployer = user.activeMode === "employer";

  return (
    <section className="py-12">
      <div className={container}>
        <div className="mb-8 inline-flex p-1 rounded-2xl bg-zinc-100 border border-zinc-200">
          {(["worker", "employer"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setMode(mode)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                user.activeMode === mode ? "bg-zinc-900 text-white shadow" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {mode === "worker" ? t("workerMode") : t("employerMode")}
            </button>
          ))}
        </div>
        {isEmployer ? <EmployerDashboard /> : <WorkerDashboard user={user} />}
      </div>
    </section>
  );
}
