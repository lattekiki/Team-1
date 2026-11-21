import { Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { JobSummary } from "@team1/shared";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { formatPay } from "../lib/format.ts";
import { useToast } from "../lib/toast.tsx";
import { useAction } from "../lib/useApi.ts";
import { btn, ErrorBox, field, Modal, TrustTierBadge } from "./ui.tsx";

export function ApplyModal({ job, onClose, onApplied }: { job: JobSummary; onClose: () => void; onApplied: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction();
  const [message, setMessage] = useState("");
  const [proposedPay, setProposedPay] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const ok = await run(
      () =>
        api(`/jobs/${job.id}/applications`, {
          body: { message, proposedPay: job.negotiable && proposedPay ? Number(proposedPay) : null },
        }),
      setError,
    );
    if (ok) {
      toast(`Pitch sent to @${job.employer.username}. Your phone number stays hidden until you confirm a pairing.`);
      onApplied();
      onClose();
    }
  };

  return (
    <Modal title="Write Your Experience & Pitch" eyebrow={`@${job.employer.username} • ${job.area}`} onClose={onClose}>
      <div className="mt-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="font-bold text-sm text-zinc-900">{job.title}</p>
          <span className="font-extrabold text-sm text-zinc-900 shrink-0">{formatPay(job)}</span>
        </div>
        {job.description && <p className="text-xs text-zinc-600">{job.description}</p>}
        <div className="pt-1 flex flex-wrap items-center gap-2">
          <TrustTierBadge tier={job.tier} />
          {job.paymentTerms && <span className="text-[11px] font-semibold text-zinc-500">{job.paymentTerms}</span>}
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="pitch" className={field.label}>
            Your relevant experience (only the employer sees this)
          </label>
          <textarea
            id="pitch"
            required
            minLength={10}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your hands-on experience, availability, and how close you are to the area..."
            className={field.textarea}
          />
        </div>

        {job.negotiable && (
          <div>
            <label htmlFor="proposed" className={field.label}>
              Propose a different amount (ETB, optional)
            </label>
            <input
              id="proposed"
              type="number"
              min={0}
              inputMode="numeric"
              value={proposedPay}
              onChange={(e) => setProposedPay(e.target.value)}
              placeholder={`Listed: ${formatPay(job)}`}
              className={field.input}
            />
          </div>
        )}

        <div className="p-3 rounded-xl bg-zinc-100 text-xs text-zinc-700 flex items-center gap-2">
          <Lock className="w-4 h-4 text-zinc-900 shrink-0" />
          <span>
            Applying as <strong>@{user?.username}</strong>. Phone numbers stay hidden until you accept the employer's
            selection.
          </span>
        </div>

        {error && <ErrorBox message={error} />}

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button type="button" onClick={onClose} className={btn.ghost}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btn.primary}>
            Submit Pitch & Apply
          </button>
        </div>
      </form>
    </Modal>
  );
}
