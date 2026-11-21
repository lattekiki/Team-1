import { Award, Ban, Briefcase, MapPin, Star } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { ACTIVE_WORKER_JOBS, type PublicProfile } from "@team1/shared";
import { ReportButton } from "../components/Modals.tsx";
import { btn, container, EmptyState, ErrorBox, Rating, Spinner, StatusPill } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { initials } from "../lib/format.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";

export function PublicProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  const { t, tp, fmt } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { busy, run } = useAction();
  const res = useApi<{ profile: PublicProfile }>(`/users/${encodeURIComponent(username ?? "")}`);

  if (res.loading && !res.data) return <Spinner />;
  if (res.error || !res.data) {
    return (
      <div className={`${container} py-16`}>
        <ErrorBox message={res.error?.message ?? t("userNotFound")} />
      </div>
    );
  }
  const p = res.data.profile;
  const isMe = user?.username === p.username;

  const toggleBlock = async () => {
    if (!user) return navigate(`/login?next=/u/${p.username}`);
    if (!p.blockedByMe && !confirm(t("confirmBlock", { username: p.username }))) return;
    const ok = await run(async () => {
      await api(`/users/${encodeURIComponent(p.username)}/block`, {
        method: p.blockedByMe ? "DELETE" : "POST",
      });
      return true;
    }, (m) => toast(m, "error"));
    if (ok) {
      toast(p.blockedByMe ? t("toastUnblocked", { username: p.username }) : t("toastBlocked", { username: p.username }));
      res.reload();
    }
  };

  return (
    <section className="py-12">
      <div className={`${container} max-w-4xl space-y-6`}>
        <div className="bg-zinc-900 text-white rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white text-zinc-900 flex items-center justify-center font-extrabold text-xl">
              {initials(p.username)}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold">@{p.username}</h1>
              {isMe && (
                <Link to="/profile" className="text-xs underline text-zinc-300">
                  {t("editYourProfile")}
                </Link>
              )}
              <p className="text-xs text-zinc-400 mt-1">{t("memberSince", { date: fmt.date(p.memberSince) })}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Rating value={p.rating} count={p.reviewCount} dark />
                <span className="text-xs text-zinc-300">{tp("completedJobs", p.completedJobs)}</span>
                {p.identityVerified && <StatusPill tone="dark">{t("badgeIdVerified")}</StatusPill>}
                {p.highTrustApproved && <StatusPill tone="dark">{t("badgeVipApproved")}</StatusPill>}
                {p.completedJobs >= ACTIVE_WORKER_JOBS && (
                  <StatusPill tone="dark">
                    <Award className="w-3 h-3" />
                    {t("activeWorkerBadge")}
                  </StatusPill>
                )}
              </div>
            </div>
          </div>
        </div>

        {p.blockedByMe && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="flex items-start gap-2">
              <Ban className="w-4 h-4 shrink-0 mt-0.5" />
              {t("blockedBanner")}
            </p>
            <button disabled={busy} onClick={toggleBlock} className={btn.light}>
              {t("unblockUser", { username: p.username })}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {p.worker && (
            <div className="bg-white border border-zinc-200 rounded-3xl p-6 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("asWorker")}</p>
              {p.worker.bio && <p className="text-sm text-zinc-700 leading-relaxed">{p.worker.bio}</p>}
              <p className="text-xs text-zinc-600 flex flex-wrap gap-x-3 gap-y-1">
                <span>{fmt.experience(p.worker.experienceLevel)}</span>
                {p.worker.area && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {fmt.area(p.worker.area)}
                  </span>
                )}
                {p.worker.availability && <span>{p.worker.availability}</span>}
              </p>
              {p.worker.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.worker.skills.map((s) => (
                    <span key={s.slug} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800">
                      ✓ {fmt.skill(s.slug, s.name)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {p.employer && (
            <div className="bg-white border border-zinc-200 rounded-3xl p-6 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("asEmployer")}</p>
              <p className="text-sm font-bold flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                {p.employer.businessName ?? fmt.employerType(p.employer.employerType)}
              </p>
              {p.employer.area && <p className="text-xs text-zinc-600">{fmt.area(p.employer.area)}</p>}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Star className="w-4 h-4" />
            {t("reviews")}
          </h2>
          {p.reviews.length ? (
            p.reviews.map((r, i) => (
              <div key={i} className="p-5 rounded-2xl bg-white border border-zinc-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-amber-600" aria-label={tp("stars", r.overall)}>
                    {"★".repeat(r.overall)}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    @{r.reviewer} • {fmt.timeAgo(r.createdAt)}
                  </span>
                </div>
                {r.body && <p className="text-sm text-zinc-700 mt-2">{r.body}</p>}
              </div>
            ))
          ) : (
            <EmptyState icon={Star} title={t("noReviews")}>
              {t("noReviewsHint")}
            </EmptyState>
          )}
        </div>

        {user && !isMe && (
          <div className="flex flex-wrap items-center gap-4 pt-2">
            {!p.blockedByMe && (
              <button
                disabled={busy}
                onClick={toggleBlock}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 hover:text-red-700"
              >
                <Ban className="w-3.5 h-3.5" />
                {t("blockUser", { username: p.username })}
              </button>
            )}
            <ReportButton targetType="user" targetId={p.id} label={t("reportUser")} />
          </div>
        )}
      </div>
    </section>
  );
}
