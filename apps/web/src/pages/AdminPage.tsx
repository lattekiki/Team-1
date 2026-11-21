import { Flag, ScrollText, Search, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Role, VerificationKind } from "@team1/shared";
import { btn, container, EmptyState, field, Rating, Spinner, StatusPill } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useI18n } from "../lib/i18n.tsx";
import type { MessageKey } from "../lib/locales/en.ts";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";

type Overview = {
  openReports: number;
  pendingVerifications: number;
  users: number;
  openJobs: number;
  activePairings: number;
  completedPairings: number;
};
type VerificationRow = {
  id: string;
  userId: string;
  username: string;
  kind: VerificationKind;
  note: string;
  status: string;
  identityVerified: boolean;
  highTrustApproved: boolean;
  rating: number | null;
  completedJobs: number;
  createdAt: string;
};
type ReportRow = {
  id: string;
  reporter: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  resolutionNote: string | null;
  resolvedBy: string | null;
  createdAt: string;
};
type UserRow = {
  id: string;
  username: string | null;
  role: Role;
  status: string;
  identityVerified: boolean;
  highTrustApproved: boolean;
  createdAt: string;
};
type AuditRow = {
  id: string;
  actor: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
};

const TARGET_LINK: Record<string, (id: string) => string | null> = {
  job: (id) => `/jobs/${id}`,
  pairing: (id) => `/pairings/${id}`,
};

function VerificationQueue({ canDecide, onChanged }: { canDecide: boolean; onChanged: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const res = useApi<{ records: VerificationRow[] }>("/admin/verification?status=pending");

  const decide = async (r: VerificationRow, approve: boolean) => {
    const note = approve ? undefined : prompt(t("rejectPrompt")) ?? undefined;
    const ok = await run(
      () => api(`/admin/verification/${r.id}/${approve ? "approve" : "reject"}`, { body: { note } }),
      (m) => toast(m, "error"),
    );
    if (ok) {
      toast(
        t("toastVerifDecision", {
          kind: fmt.verifKind(r.kind),
          username: r.username,
          status: fmt.verifStatus(approve ? "approved" : "rejected"),
        }),
      );
      res.reload();
      onChanged();
    }
  };

  if (res.loading && !res.data) return <Spinner />;
  if (!res.data?.records.length) return <EmptyState icon={ShieldCheck} title={t("noPendingVerif")} />;
  return (
    <div className="space-y-3">
      {res.data.records.map((r) => (
        <div key={r.id} className="p-5 rounded-2xl bg-white border border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/u/${r.username}`} className="font-bold hover:underline">
                @{r.username}
              </Link>
              <StatusPill tone={r.kind === "high_trust" ? "warn" : "neutral"}>{fmt.verifKind(r.kind)}</StatusPill>
              <Rating value={r.rating} />
              <span className="text-xs text-zinc-500">{t("completedCount", { n: r.completedJobs })}</span>
              {r.identityVerified && <StatusPill tone="good">{t("badgeIdVerified")}</StatusPill>}
            </div>
            <p className="text-sm text-zinc-700 mt-2">“{r.note}”</p>
            <p className="text-[11px] text-zinc-400 mt-1">{t("requestedAgo", { time: fmt.timeAgo(r.createdAt) })}</p>
            {r.kind === "high_trust" && !r.identityVerified && (
              <p className="text-[11px] font-semibold text-amber-800 mt-1">{t("identityBeforeVip")}</p>
            )}
          </div>
          {canDecide && (
            <div className="flex gap-2 shrink-0">
              <button disabled={busy} onClick={() => decide(r, false)} className={btn.danger}>
                {t("reject")}
              </button>
              <button
                disabled={busy || (r.kind === "high_trust" && !r.identityVerified)}
                onClick={() => decide(r, true)}
                className={btn.primary}
              >
                {t("approve")}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ReportsQueue({ canDecide, onChanged }: { canDecide: boolean; onChanged: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const res = useApi<{ reports: ReportRow[] }>("/admin/reports");

  const update = async (r: ReportRow, status: "reviewing" | "resolved" | "dismissed") => {
    const note = status === "reviewing" ? undefined : prompt(t("resolvePrompt")) ?? undefined;
    const ok = await run(() => api(`/admin/reports/${r.id}/resolve`, { body: { status, note } }), (m) => toast(m, "error"));
    if (ok) {
      toast(t("toastReportMarked", { status: fmt.reportStatus(status) }));
      res.reload();
      onChanged();
    }
  };

  if (res.loading && !res.data) return <Spinner />;
  if (!res.data?.reports.length) return <EmptyState icon={Flag} title={t("noReports")} />;
  return (
    <div className="space-y-3">
      {res.data.reports.map((r) => {
        const link = TARGET_LINK[r.targetType]?.(r.targetId);
        const open = r.status === "open" || r.status === "reviewing";
        return (
          <div key={r.id} className={`p-5 rounded-2xl border ${open ? "bg-white border-zinc-200" : "bg-zinc-50 border-zinc-100"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-500">
                <strong className="text-zinc-800">{t("reportedBy", { username: r.reporter })}</strong> •{" "}
                {link ? (
                  <Link to={link} className="underline font-semibold">
                    {fmt.reportTarget(r.targetType)}
                  </Link>
                ) : (
                  <span className="font-semibold">{fmt.reportTarget(r.targetType)}</span>
                )}{" "}
                • {fmt.timeAgo(r.createdAt)}
              </p>
              <StatusPill tone={r.status === "open" ? "bad" : r.status === "reviewing" ? "warn" : "neutral"}>
                {fmt.reportStatus(r.status)}
              </StatusPill>
            </div>
            <p className="text-sm text-zinc-800 mt-2">{r.reason}</p>
            {r.resolutionNote && (
              <p className="text-xs text-zinc-500 mt-1">
                {r.resolvedBy
                  ? t("noteBy", { username: r.resolvedBy, note: r.resolutionNote })
                  : t("noteText", { note: r.resolutionNote })}
              </p>
            )}
            {canDecide && open && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.status === "open" && (
                  <button disabled={busy} onClick={() => update(r, "reviewing")} className={btn.light}>
                    {t("startReview")}
                  </button>
                )}
                <button disabled={busy} onClick={() => update(r, "resolved")} className={btn.primary}>
                  {t("resolve")}
                </button>
                <button disabled={busy} onClick={() => update(r, "dismissed")} className={btn.ghost}>
                  {t("dismiss")}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function UsersPanel({ canDecide, myId }: { canDecide: boolean; myId: string }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const res = useApi<{ users: UserRow[] }>(`/admin/users?q=${encodeURIComponent(query)}`);

  const flag = async (u: UserRow, path: "high-trust" | "suspend", value: boolean, confirmKey: MessageKey) => {
    const username = u.username ?? "";
    if (!confirm(t(confirmKey, { username }))) return;
    const ok = await run(() => api(`/admin/users/${u.id}/${path}`, { body: { value } }), (m) => toast(m, "error"));
    if (ok) {
      toast(t("toastUserUpdated", { username }));
      res.reload();
    }
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchUsernames")}
            aria-label={t("searchUsernames")}
            className={`${field.input} pl-9`}
          />
        </div>
        <button type="submit" className={btn.primary}>
          {t("search")}
        </button>
      </form>
      {res.loading && !res.data ? (
        <Spinner />
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500 text-left">
              <tr>
                <th className="p-3 font-bold">{t("colUser")}</th>
                <th className="p-3 font-bold">{t("colRole")}</th>
                <th className="p-3 font-bold">{t("colTrust")}</th>
                <th className="p-3 font-bold">{t("colJoined")}</th>
                <th className="p-3 font-bold sr-only">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {res.data?.users.map((u) => (
                <tr key={u.id}>
                  <td className="p-3">
                    {u.username ? (
                      <Link to={`/u/${u.username}`} className="font-bold hover:underline">
                        @{u.username}
                      </Link>
                    ) : (
                      <span className="text-zinc-400">{t("noUsername")}</span>
                    )}
                    {u.status === "suspended" && (
                      <span className="ml-2">
                        <StatusPill tone="bad">{t("userStatus_suspended")}</StatusPill>
                      </span>
                    )}
                  </td>
                  <td className="p-3">{fmt.role(u.role)}</td>
                  <td className="p-3 space-x-1">
                    {u.identityVerified && <StatusPill tone="good">{t("trustId")}</StatusPill>}
                    {u.highTrustApproved && <StatusPill tone="warn">{t("trustVip")}</StatusPill>}
                  </td>
                  <td className="p-3 text-zinc-500">{fmt.date(u.createdAt)}</td>
                  <td className="p-3">
                    {canDecide && u.id !== myId && (
                      <div className="flex justify-end gap-1.5">
                        {u.highTrustApproved ? (
                          <button disabled={busy} onClick={() => flag(u, "high-trust", false, "confirmRevokeVip")} className={btn.ghost}>
                            {t("revokeVip")}
                          </button>
                        ) : (
                          u.identityVerified && (
                            <button disabled={busy} onClick={() => flag(u, "high-trust", true, "confirmGrantVip")} className={btn.light}>
                              {t("grantVip")}
                            </button>
                          )
                        )}
                        {u.status === "suspended" ? (
                          <button disabled={busy} onClick={() => flag(u, "suspend", false, "confirmReinstate")} className={btn.light}>
                            {t("reinstate")}
                          </button>
                        ) : (
                          <button disabled={busy} onClick={() => flag(u, "suspend", true, "confirmSuspend")} className={btn.danger}>
                            {t("suspend")}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditLog() {
  const { t, fmt } = useI18n();
  const res = useApi<{ entries: AuditRow[] }>("/admin/audit");
  if (res.loading && !res.data) return <Spinner />;
  if (!res.data?.entries.length) return <EmptyState icon={ScrollText} title={t("noAudit")} />;
  return (
    <ul className="bg-white border border-zinc-200 rounded-2xl divide-y divide-zinc-100">
      {res.data.entries.map((a) => (
        <li key={a.id} className="p-3 text-xs flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>@{a.actor ?? t("auditSystem")}</strong> <span className="text-zinc-700">{fmt.audit(a.action)}</span>{" "}
            <span className="text-zinc-500">
              • {t("auditOn", { target: fmt.reportTarget(a.targetType), id: a.targetId.slice(0, 8) })}
            </span>
            {typeof a.details?.note === "string" && a.details.note && <span className="text-zinc-500"> — “{a.details.note}”</span>}
          </span>
          <span className="text-zinc-400">{fmt.timeAgo(a.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

type Tab = "verification" | "reports" | "users" | "audit";

export function AdminPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("verification");
  const overview = useApi<{ overview: Overview }>("/admin/overview");
  if (!user) return null;
  const isAdmin = user.role === "admin";
  const o = overview.data?.overview;

  const tabs: { id: Tab; label: string; icon: typeof Users; count?: number }[] = [
    { id: "verification", label: t("tabVerification"), icon: ShieldCheck, count: o?.pendingVerifications },
    { id: "reports", label: t("tabReports"), icon: Flag, count: o?.openReports },
    { id: "users", label: t("tabUsers"), icon: Users },
    ...(isAdmin ? [{ id: "audit" as const, label: t("tabAudit"), icon: ScrollText }] : []),
  ];
  const stats: [string, number | undefined][] = [
    [t("adminPendingVerif"), o?.pendingVerifications],
    [t("adminOpenReports"), o?.openReports],
    [t("adminUsers"), o?.users],
    [t("adminOpenJobs"), o?.openJobs],
    [t("adminActivePairings"), o?.activePairings],
    [t("adminCompleted"), o?.completedPairings],
  ];

  return (
    <section className="py-12">
      <div className={`${container} space-y-8`}>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("adminTitle")}</h1>
          <p className="text-sm text-zinc-500 mt-1">{isAdmin ? t("adminSubtitleAdmin") : t("adminSubtitleSupport")}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {stats.map(([label, value]) => (
            <div key={label} className="p-4 rounded-2xl bg-white border border-zinc-200">
              <p className="text-2xl font-extrabold">{value ?? "–"}</p>
              <p className="text-[11px] font-semibold text-zinc-500">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold ${
                tab === item.id ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
              {item.count ? <span className="ml-1 px-1.5 rounded-full bg-red-500 text-white text-[10px]">{item.count}</span> : null}
            </button>
          ))}
        </div>

        {tab === "verification" && <VerificationQueue canDecide={isAdmin} onChanged={overview.reload} />}
        {tab === "reports" && <ReportsQueue canDecide={isAdmin} onChanged={overview.reload} />}
        {tab === "users" && <UsersPanel canDecide={isAdmin} myId={user.id} />}
        {tab === "audit" && isAdmin && <AuditLog />}
      </div>
    </section>
  );
}
