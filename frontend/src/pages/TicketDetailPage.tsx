import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import type { SupportTicket } from "@team1/shared";
import { btn, container, ErrorBox, field, Spinner, StatusPill } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useI18n } from "../lib/i18n.tsx";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";

function tone(status: string) {
  if (status === "waiting_staff" || status === "open") return "warn" as const;
  if (status === "waiting_user") return "good" as const;
  return "neutral" as const;
}

export function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, fmt } = useI18n();
  const toast = useToast();
  const res = useApi<{ ticket: SupportTicket }>(id ? `/tickets/${id}` : null);
  const { busy, run } = useAction();
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (res.loading && !res.data) return <Spinner />;
  if (res.error || !res.data) {
    return (
      <div className={`${container} py-16`}>
        <ErrorBox message={res.error?.message ?? t("ticketNotFound")} />
      </div>
    );
  }

  const ticket = res.data.ticket;
  const isStaff = user?.role === "admin" || user?.role === "support";
  const open = ["open", "waiting_staff", "waiting_user"].includes(ticket.status);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api(`/tickets/${ticket.id}/messages`, { body: { body: reply } }), setError);
    if (ok) {
      setReply("");
      setError(null);
      toast(t("toastTicketReply"));
      res.reload();
    }
  };

  const close = async () => {
    if (!confirm(t("confirmCloseTicket"))) return;
    const ok = await run(() => api(`/tickets/${ticket.id}/close`, { method: "POST" }), (m) => toast(m, "error"));
    if (ok) {
      toast(t("toastTicketClosed"));
      res.reload();
    }
  };

  const resolve = async (status: "resolved" | "closed") => {
    const note = prompt(t("resolvePrompt")) ?? undefined;
    const ok = await run(
      () => api(`/admin/tickets/${ticket.id}/resolve`, { body: { status, note } }),
      (m) => toast(m, "error"),
    );
    if (ok) {
      toast(t("toastTicketResolved", { status: fmt.ticketStatus(status) }));
      res.reload();
    }
  };

  return (
    <section className="py-12">
      <div className={`${container} max-w-3xl space-y-6`}>
        <Link to={isStaff ? "/admin" : "/tickets"} className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="w-3.5 h-3.5" />
          {isStaff ? t("tabTickets") : t("ticketsTitle")}
        </Link>

        <div className="bg-white border border-zinc-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={tone(ticket.status)}>{fmt.ticketStatus(ticket.status)}</StatusPill>
            <span className="text-xs font-semibold text-zinc-500">{fmt.ticketCategory(ticket.category)}</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">{ticket.subject}</h1>
          <p className="text-xs text-zinc-500">
            {ticket.username ? `@${ticket.username} • ` : ""}
            {fmt.timeAgo(ticket.createdAt)}
          </p>
        </div>

        <ul className="space-y-3">
          {ticket.messages.map((m) => (
            <li
              key={m.id}
              className={`p-4 rounded-2xl border ${
                m.author.isMe ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200"
              }`}
            >
              <p className={`text-[11px] font-bold ${m.author.isMe ? "text-zinc-300" : "text-zinc-400"}`}>
                @{m.author.username}
                {m.author.isStaff ? ` · ${t("ticketStaff")}` : ""}
                {" · "}
                {fmt.timeAgo(m.createdAt)}
              </p>
              <p className={`text-sm mt-1 whitespace-pre-wrap ${m.author.isMe ? "text-white" : "text-zinc-800"}`}>
                {m.body}
              </p>
            </li>
          ))}
        </ul>

        {open && (
          <form onSubmit={send} className="bg-white border border-zinc-200 rounded-3xl p-5 space-y-3">
            <textarea
              required
              minLength={1}
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={t("ticketReplyPlaceholder")}
              className={field.textarea}
              aria-label={t("ticketReplyAria")}
            />
            {error && <ErrorBox message={error} />}
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {!isStaff && (
                  <button type="button" disabled={busy} onClick={close} className={btn.ghost}>
                    {t("closeTicket")}
                  </button>
                )}
                {isStaff && (
                  <>
                    <button type="button" disabled={busy} onClick={() => resolve("resolved")} className={btn.light}>
                      {t("resolve")}
                    </button>
                    <button type="button" disabled={busy} onClick={() => resolve("closed")} className={btn.ghost}>
                      {t("closeTicket")}
                    </button>
                  </>
                )}
              </div>
              <button type="submit" disabled={busy} className={btn.primary}>
                {t("ticketReplySend")}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
