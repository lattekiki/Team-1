import { Bell, CheckCheck } from "lucide-react";
import { Link } from "react-router";
import type { Notification } from "@team1/shared";
import { btn, container, EmptyState, Spinner } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useAction, useApi } from "../lib/useApi.ts";

export function NotificationsPage() {
  const { t, fmt } = useI18n();
  const res = useApi<{ notifications: Notification[]; unread: number }>("/notifications");
  const { busy, run } = useAction();

  const markAll = async () => {
    await run(() => api("/notifications/read", { body: {} }));
    res.reload();
  };

  return (
    <section className="py-12">
      <div className={`${container} max-w-3xl`}>
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">{t("notificationsTitle")}</h1>
          {(res.data?.unread ?? 0) > 0 && (
            <button onClick={markAll} disabled={busy} className={btn.light}>
              <CheckCheck className="w-4 h-4" />
              {t("markAllRead")}
            </button>
          )}
        </div>
        {res.loading && !res.data ? (
          <Spinner />
        ) : res.data?.notifications.length ? (
          <ul className="bg-white border border-zinc-200 rounded-3xl divide-y divide-zinc-100 overflow-hidden">
            {res.data.notifications.map((n) => {
              const { text, href } = fmt.notification(n);
              const body = (
                <div className="flex items-start gap-3 p-4">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.readAt ? "bg-transparent" : "bg-emerald-500"}`} />
                  <div className="flex-1">
                    <p className={`text-sm ${n.readAt ? "text-zinc-600" : "font-semibold text-zinc-900"}`}>{text}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{fmt.timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {href ? (
                    <Link to={href} className="block hover:bg-zinc-50">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={Bell} title={t("allCaughtUp")}>
            {t("allCaughtUpHint")}
          </EmptyState>
        )}
      </div>
    </section>
  );
}
