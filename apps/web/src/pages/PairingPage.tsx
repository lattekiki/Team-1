import { CheckCircle2, Clock, Lock, MapPin, Phone, RefreshCw, Star, Unlock } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import type { Pairing } from "@team1/shared";
import { DisputeButton, RebookModal, ReportButton, ReviewModal } from "../components/Modals.tsx";
import { btn, container, ErrorBox, Spinner, StatusPill, TrustTierBadge } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";

const STEPS = ["step_selected", "step_confirmed", "step_started", "step_completed", "step_reviewed"] as const;

function stepIndex(p: Pairing) {
  if (p.status === "completed") return p.myReview ? 4 : 3;
  return { pending_confirmation: 0, confirmed: 1, in_progress: 2 }[p.status as string] ?? 0;
}

export function PairingPage() {
  const { id } = useParams();
  const { t, fmt } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [reviewing, setReviewing] = useState(false);
  const [rebooking, setRebooking] = useState(false);
  const res = useApi<{ pairing: Pairing }>(`/pairings/${id}`);

  if (res.loading && !res.data) return <Spinner />;
  if (res.error || !res.data) {
    return (
      <div className={`${container} py-16`}>
        <ErrorBox message={res.error?.message ?? t("pairingNotFound")} />
      </div>
    );
  }
  const p = res.data.pairing;
  const isWorker = p.myRole === "worker";
  const other = isWorker ? p.employer : p.worker;
  const username = other.username;
  const myCompletion = isWorker ? p.workerCompletedAt : p.employerCompletedAt;
  const theirCompletion = isWorker ? p.employerCompletedAt : p.workerCompletedAt;
  const active = ["pending_confirmation", "confirmed", "in_progress", "completed"].includes(p.status);
  const current = stepIndex(p);

  const act = async (action: string, message: string) => {
    const ok = await run(() => api(`/pairings/${p.id}/${action}`, { method: "POST" }), (m) => toast(m, "error"));
    if (ok) {
      toast(message);
      res.reload();
    }
  };

  return (
    <section className="py-12">
      <div className={`${container} grid grid-cols-1 lg:grid-cols-3 gap-8`}>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <TrustTierBadge tier={p.job.tier} />
              <StatusPill tone={p.status === "completed" || p.status === "confirmed" ? "good" : active ? "warn" : "bad"}>
                {fmt.pairingStatus(p.status)}
              </StatusPill>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-4">
              <Link to={`/jobs/${p.job.id}`} className="hover:underline">
                {p.job.title}
              </Link>
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {isWorker ? t("labelEmployer") : t("labelWorker")}:{" "}
              <Link to={`/u/${username}`} className="font-semibold text-zinc-800 hover:underline">
                @{username}
              </Link>{" "}
              • {fmt.category(p.job.categorySlug, p.job.categoryName)}
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-zinc-700">
              <p className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                {fmt.area(p.job.area)}
                {p.job.landmark && ` • ${p.job.landmark}`}
              </p>
              <p className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                {fmt.schedule(p.job.startsAt, p.job.endsAt)}
              </p>
              <p className="font-bold">
                {p.agreedPay != null ? t("payAmount", { amount: p.agreedPay.toLocaleString("en-US") }) : t("payToAgree")} •{" "}
                {fmt.payType(p.job.payType)}
              </p>
            </div>

            {active && (
              <ol className="mt-8 grid grid-cols-5 gap-2">
                {STEPS.map((step, i) => (
                  <li key={step} className="text-center">
                    <div className={`h-1.5 rounded-full ${i <= current ? "bg-zinc-900" : "bg-zinc-200"}`} />
                    <p className={`mt-2 text-[10px] sm:text-[11px] font-semibold ${i <= current ? "text-zinc-900" : "text-zinc-400"}`}>
                      {t(step)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div
            className={`p-6 rounded-3xl border ${p.contact ? "bg-zinc-900 text-white border-zinc-900 shadow-lg" : "bg-white border-zinc-200"}`}
          >
            {p.contact ? (
              <>
                <div className="flex items-center gap-2 text-emerald-300 text-sm font-bold">
                  <Unlock className="w-4 h-4" />
                  {t("contactUnlocked")}
                </div>
                <a href={`tel:${p.contact.phone}`} className="mt-2 flex items-center gap-2 font-mono text-xl font-bold">
                  <Phone className="w-5 h-5" />
                  {p.contact.phone}
                </a>
                <p className="text-xs text-zinc-400 mt-2">{t("contactCallHint", { username })}</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-zinc-700 text-sm font-bold">
                  <Lock className="w-4 h-4" />
                  {t("contactHidden")}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {p.status === "pending_confirmation"
                    ? isWorker
                      ? t("contactHiddenWorker")
                      : t("contactHiddenEmployer", { username })
                    : t("contactNotShared")}
                </p>
              </>
            )}
          </div>

          {(p.myReview || p.theirReview) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {p.myReview && (
                <div className="p-5 rounded-2xl bg-white border border-zinc-200">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("yourReview")}</p>
                  <p className="mt-1 font-bold text-amber-600">{"★".repeat(p.myReview.overall)}</p>
                  {p.myReview.body && <p className="text-sm text-zinc-600 mt-1">{p.myReview.body}</p>}
                </div>
              )}
              {p.theirReview && (
                <div className="p-5 rounded-2xl bg-white border border-zinc-200">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("theirReview", { username })}</p>
                  <p className="mt-1 font-bold text-amber-600">{"★".repeat(p.theirReview.overall)}</p>
                  {p.theirReview.body && <p className="text-sm text-zinc-600 mt-1">{p.theirReview.body}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 space-y-3 shadow-sm">
            <p className="text-sm font-bold">{t("nextStep")}</p>

            {p.status === "pending_confirmation" && isWorker && (
              <>
                <p className="text-xs text-zinc-500">{t("selectedYou", { username })}</p>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => act("accept", t("toastConfirmed"))} className={btn.primary}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    {t("acceptUnlock")}
                  </button>
                  <button disabled={busy} onClick={() => act("decline", t("toastDeclinedJob"))} className={btn.ghost}>
                    {t("decline")}
                  </button>
                </div>
              </>
            )}
            {p.status === "pending_confirmation" && !isWorker && (
              <p className="text-xs text-zinc-500">{t("waitingConfirm", { username })}</p>
            )}

            {p.status === "confirmed" && (
              <button disabled={busy} onClick={() => act("start", t("toastStarted"))} className={btn.light}>
                {t("markStarted")}
              </button>
            )}

            {(p.status === "confirmed" || p.status === "in_progress") &&
              (myCompletion ? (
                <p className="text-xs text-zinc-500">
                  {t("youConfirmedCompletion", { date: fmt.date(myCompletion), username })}
                </p>
              ) : (
                <>
                  {theirCompletion && (
                    <p className="text-xs font-semibold text-amber-800">{t("theyMarkedCompleted", { username })}</p>
                  )}
                  <button disabled={busy} onClick={() => act("complete", t("toastCompletion"))} className={btn.primary}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    {t("confirmCompleted")}
                  </button>
                </>
              ))}

            {p.status === "completed" && !p.myReview && (
              <button onClick={() => setReviewing(true)} className={btn.primary}>
                <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
                {t("rateUser", { username })}
              </button>
            )}

            {p.status === "completed" && !isWorker && (
              p.rebooking?.status === "pending" ? (
                <p className="text-xs text-zinc-500">{t("rebookPendingNote", { username })}</p>
              ) : (
                <button onClick={() => setRebooking(true)} className={btn.light}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t("rebookUser", { username })}
                </button>
              )
            )}

            {p.status === "completed" && p.myReview && isWorker && <p className="text-xs text-zinc-500">{t("allDone")}</p>}

            {p.status === "disputed" && p.dispute && (
              <div className="space-y-2 text-xs text-amber-900">
                <p className="font-semibold">{p.dispute.openedByMe ? t("disputeOpenedByYou") : t("disputeOpenedByOther")}</p>
                <p className="text-zinc-700">“{p.dispute.reason}”</p>
                {p.dispute.status === "open" ? (
                  <p className="text-zinc-500">{t("disputeWaitingStaff")}</p>
                ) : (
                  <>
                    <p className="text-zinc-500">
                      {t("disputeResolvedNote", { outcome: fmt.disputeStatus(p.dispute.status) })}
                    </p>
                    {p.dispute.resolutionNote && (
                      <p className="text-zinc-500">{t("noteText", { note: p.dispute.resolutionNote })}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {!active && p.status !== "disputed" && (
              <p className="text-xs text-zinc-500">{t("pairingStatusNote", { status: fmt.pairingStatus(p.status) })}</p>
            )}

            {(p.status === "pending_confirmation" || p.status === "confirmed") && (
              <button
                disabled={busy}
                onClick={() => confirm(t("confirmCancelPairing")) && act("cancel", t("toastPairingCancelled"))}
                className="text-[11px] font-bold text-red-700 hover:underline"
              >
                {t("cancelPairing")}
              </button>
            )}

            {["pending_confirmation", "confirmed", "in_progress"].includes(p.status) && (
              <DisputeButton pairingId={p.id} onDone={res.reload} />
            )}
          </div>

          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-600 space-y-2">
            <p className="font-bold text-zinc-800">{t("safetyTitle")}</p>
            <p>{t("safetyHint")}</p>
            <ReportButton targetType="pairing" targetId={p.id} label={t("reportPairing")} />
          </div>
        </aside>
      </div>

      {reviewing && <ReviewModal pairing={p} onClose={() => setReviewing(false)} onDone={res.reload} />}
      {rebooking && <RebookModal pairing={p} onClose={() => setRebooking(false)} onDone={res.reload} />}
    </section>
  );
}
