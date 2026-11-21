import { Flag, Star } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Pairing } from "@team1/shared";
import { api } from "../lib/api.ts";
import { fromLocalInput } from "../lib/format.ts";
import { useToast } from "../lib/toast.tsx";
import { useAction } from "../lib/useApi.ts";
import { btn, ErrorBox, field, Modal } from "./ui.tsx";

function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-bold text-zinc-700">{label}</span>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            type="button"
            key={star}
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            onClick={() => onChange(star)}
            className={`p-1.5 rounded-lg border ${value >= star ? "bg-amber-50 border-amber-300 text-amber-500" : "bg-zinc-50 border-zinc-200 text-zinc-300"}`}
          >
            <Star className="w-4 h-4 fill-current" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReviewModal({ pairing, onClose, onDone }: { pairing: Pairing; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { busy, run } = useAction();
  const [scores, setScores] = useState({ overall: 5, reliability: 5, communication: 5, quality: 5 });
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const other = pairing.myRole === "worker" ? pairing.employer.username : pairing.worker.username;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api(`/pairings/${pairing.id}/reviews`, { body: { ...scores, body } }), setError);
    if (ok) {
      toast(`Review for @${other} submitted`);
      onDone();
      onClose();
    }
  };

  return (
    <Modal title={`Rate & review @${other}`} eyebrow={pairing.job.title} onClose={onClose}>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <StarPicker label="Overall" value={scores.overall} onChange={(v) => setScores((s) => ({ ...s, overall: v }))} />
        <StarPicker
          label="Reliability & punctuality"
          value={scores.reliability}
          onChange={(v) => setScores((s) => ({ ...s, reliability: v }))}
        />
        <StarPicker
          label="Communication"
          value={scores.communication}
          onChange={(v) => setScores((s) => ({ ...s, communication: v }))}
        />
        {pairing.myRole === "employer" && (
          <StarPicker label="Work quality" value={scores.quality} onChange={(v) => setScores((s) => ({ ...s, quality: v }))} />
        )}
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Optional: what went well, what could be better..."
          className={field.textarea}
          aria-label="Written review"
        />
        <p className="text-[11px] text-zinc-500">One review per job. It appears on their public profile.</p>
        {error && <ErrorBox message={error} />}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={btn.ghost}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btn.primary}>
            Submit review
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function RebookModal({ pairing, onClose, onDone }: { pairing: Pairing; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { busy, run } = useAction();
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pay, setPay] = useState(pairing.agreedPay != null ? String(pairing.agreedPay) : "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(
      () =>
        api(`/pairings/${pairing.id}/rebook`, {
          body: {
            startsAt: fromLocalInput(startsAt),
            endsAt: fromLocalInput(endsAt),
            payMin: pay ? Number(pay) : null,
            payMax: pay ? Number(pay) : null,
            description: description || undefined,
          },
        }),
      setError,
    );
    if (ok) {
      toast(`Rebooking request sent to @${pairing.worker.username}`);
      onDone();
      onClose();
    }
  };

  return (
    <Modal title={`Re-book @${pairing.worker.username}`} eyebrow={pairing.job.title} onClose={onClose}>
      <form onSubmit={submit} className="mt-4 space-y-3.5">
        <p className="text-xs text-zinc-600">
          We copy the previous job details. Only @{pairing.worker.username} sees this request; it isn't listed publicly.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rb-start" className={field.label}>
              New start
            </label>
            <input id="rb-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field.input} />
          </div>
          <div>
            <label htmlFor="rb-end" className={field.label}>
              New end
            </label>
            <input id="rb-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={field.input} />
          </div>
        </div>
        <div>
          <label htmlFor="rb-pay" className={field.label}>
            Pay (ETB)
          </label>
          <input id="rb-pay" type="number" min={0} value={pay} onChange={(e) => setPay(e.target.value)} className={field.input} />
        </div>
        <div>
          <label htmlFor="rb-desc" className={field.label}>
            Changes to the task (optional)
          </label>
          <textarea id="rb-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={field.textarea} />
        </div>
        {error && <ErrorBox message={error} />}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={btn.ghost}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btn.primary}>
            Send rebooking request
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ReportButton({
  targetType,
  targetId,
  label = "Report",
}: {
  targetType: "user" | "job" | "pairing" | "review";
  targetId: string;
  label?: string;
}) {
  const toast = useToast();
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api("/reports", { body: { targetType, targetId, reason } }), setError);
    if (ok) {
      toast("Report sent to the safety team. Thank you.");
      setOpen(false);
      setReason("");
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 hover:text-red-700">
        <Flag className="w-3.5 h-3.5" />
        {label}
      </button>
      {open && (
        <Modal title="Report a problem" eyebrow="Safety team" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <textarea
              required
              minLength={5}
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What happened? Include dates and details. If someone is in danger, contact local emergency services first."
              className={field.textarea}
              aria-label="Reason"
            />
            {error && <ErrorBox message={error} />}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={btn.ghost}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={btn.danger}>
                Send report
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
