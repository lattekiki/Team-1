import { LifeBuoy, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { TICKET_CATEGORIES, type SupportTicketSummary, type TicketCategory } from "@team1/shared";
import { btn, container, EmptyState, ErrorBox, field, Modal, Spinner, StatusPill } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";

function tone(status: string) {
  if (status === "waiting_staff" || status === "open") return "warn" as const;
  if (status === "waiting_user") return "good" as const;
  return "neutral" as const;
}

export function TicketsPage() {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const res = useApi<{ tickets: SupportTicketSummary[] }>("/me/tickets");
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory>("other");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(
      () => api<{ ticket: { id: string } }>("/tickets", { body: { subject, category, body } }),
      setError,
    );
    if (ok) {
      toast(t("toastTicketCreated"));
      setOpen(false);
      setSubject("");
      setBody("");
      setCategory("other");
      res.reload();
    }
  };

  return (
    <section className="py-12">
      <div className={`${container} max-w-3xl space-y-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{t("ticketsTitle")}</h1>
            <p className="text-sm text-zinc-500 mt-1">{t("ticketsSubtitle")}</p>
          </div>
          <button onClick={() => setOpen(true)} className={btn.primary}>
            <Plus className="w-4 h-4" />
            {t("newTicket")}
          </button>
        </div>

        {res.loading && !res.data ? (
          <Spinner />
        ) : res.data?.tickets.length ? (
          <ul className="bg-white border border-zinc-200 rounded-3xl divide-y divide-zinc-100 overflow-hidden">
            {res.data.tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link to={`/tickets/${ticket.id}`} className="block p-4 hover:bg-zinc-50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-zinc-900">{ticket.subject}</p>
                    <StatusPill tone={tone(ticket.status)}>{fmt.ticketStatus(ticket.status)}</StatusPill>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {fmt.ticketCategory(ticket.category)} • {fmt.timeAgo(ticket.updatedAt)}
                    {ticket.messageCount > 1 ? ` • ${t("ticketMessages", { n: ticket.messageCount })}` : ""}
                  </p>
                  {ticket.lastMessagePreview && (
                    <p className="text-sm text-zinc-600 mt-2 line-clamp-2">{ticket.lastMessagePreview}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={LifeBuoy} title={t("noTickets")}>
            <p className="text-sm text-zinc-500">{t("noTicketsHint")}</p>
          </EmptyState>
        )}
      </div>

      {open && (
        <Modal title={t("newTicket")} eyebrow={t("ticketsEyebrow")} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-zinc-600">{t("ticketSubject")}</span>
              <input
                required
                minLength={3}
                maxLength={120}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={field.input}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-zinc-600">{t("ticketCategory")}</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                className={field.input}
              >
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {fmt.ticketCategory(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-zinc-600">{t("ticketBody")}</span>
              <textarea
                required
                minLength={5}
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("ticketBodyPlaceholder")}
                className={field.textarea}
              />
            </label>
            {error && <ErrorBox message={error} />}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={btn.ghost}>
                {t("cancel")}
              </button>
              <button type="submit" disabled={busy} className={btn.primary}>
                {t("ticketSend")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
