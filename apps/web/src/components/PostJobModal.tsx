import { ShieldAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { JIMMA_AREAS, PAY_TYPES, type Category, type JobSummary, type PayType } from "@team1/shared";
import { api } from "../lib/api.ts";
import { fromLocalInput, PAY_TYPE_LABEL, TIER_LABEL, toLocalInput } from "../lib/format.ts";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";
import { btn, ErrorBox, field, Modal } from "./ui.tsx";

const PAYMENT_TERMS = [
  "Paid directly on completion",
  "Paid at the end of each day",
  "50% on arrival, 50% on completion",
  "Paid weekly",
];

type Form = {
  title: string;
  categoryId: string;
  area: string;
  landmark: string;
  startsAt: string;
  endsAt: string;
  payType: PayType;
  payMin: string;
  payMax: string;
  negotiable: boolean;
  paymentTerms: string;
  workersNeeded: string;
  description: string;
};

const fromJob = (job?: JobSummary): Form => ({
  title: job?.title ?? "",
  categoryId: job ? String(job.category.id) : "",
  area: job?.area ?? JIMMA_AREAS[0].id,
  landmark: job?.landmark ?? "",
  startsAt: toLocalInput(job?.startsAt),
  endsAt: toLocalInput(job?.endsAt),
  payType: job?.payType ?? "daily",
  payMin: job?.payMin != null ? String(job.payMin) : "",
  payMax: job?.payMax != null ? String(job.payMax) : "",
  negotiable: job?.negotiable ?? false,
  paymentTerms: job?.paymentTerms ?? PAYMENT_TERMS[0]!,
  workersNeeded: String(job?.workersNeeded ?? 1),
  description: job?.description ?? "",
});

export function PostJobModal({
  job,
  onClose,
  onSaved,
}: {
  job?: JobSummary;
  onClose: () => void;
  onSaved: (job: JobSummary) => void;
}) {
  const categories = useApi<{ categories: Category[] }>("/categories");
  const toast = useToast();
  const { busy, run } = useAction();
  const [form, setForm] = useState<Form>(() => fromJob(job));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const cats = categories.data?.categories ?? [];
  const selected = cats.find((c) => String(c.id) === form.categoryId);

  const submit = async (e: FormEvent, publish: boolean) => {
    e.preventDefault();
    setError(null);
    const body = {
      title: form.title,
      categoryId: Number(form.categoryId),
      area: form.area,
      landmark: form.landmark,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
      payType: form.payType,
      payMin: form.payMin ? Number(form.payMin) : null,
      payMax: form.payMax ? Number(form.payMax) : form.payMin ? Number(form.payMin) : null,
      negotiable: form.negotiable,
      paymentTerms: form.paymentTerms,
      workersNeeded: Number(form.workersNeeded) || 1,
      description: form.description,
      ...(job ? {} : { publish }),
    };
    const res = await run(
      () =>
        job
          ? api<{ job: JobSummary }>(`/jobs/${job.id}`, { method: "PATCH", body })
          : api<{ job: JobSummary }>("/jobs", { body }),
      setError,
    );
    if (res) {
      toast(job ? "Job updated" : publish ? `Published “${res.job.title}”` : "Saved as draft");
      onSaved(res.job);
      onClose();
    }
  };

  return (
    <Modal title={job ? "Edit job" : "Post a Job"} eyebrow="Employer Mode • Jimma Marketplace" onClose={onClose} wide>
      <form onSubmit={(e) => submit(e, true)} className="mt-4 space-y-3.5">
        <div>
          <label htmlFor="title" className={field.label}>
            Job title
          </label>
          <input
            id="title"
            required
            minLength={3}
            maxLength={120}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Weekend shop assistant or Kitchen sink repair"
            className={field.input}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="category" className={field.label}>
              Category & trust tier
            </label>
            <select
              id="category"
              required
              value={form.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              className={field.select}
            >
              <option value="">Choose a category</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({TIER_LABEL[c.tier]})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="area" className={field.label}>
              Jimma area
            </label>
            <select id="area" value={form.area} onChange={(e) => set("area", e.target.value)} className={field.select}>
              {JIMMA_AREAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} ({a.am})
                </option>
              ))}
            </select>
          </div>
        </div>

        {selected?.tier === "vip" && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Tier 1 VIP: only workers with verified identity <strong>and</strong> safety-team approval can apply. Ratings
              alone never qualify someone.
            </span>
          </div>
        )}
        {selected?.tier === "skilled" && (
          <p className="text-[11px] text-zinc-500">Tier 2: applicants must list a matching skill on their profile.</p>
        )}

        <div>
          <label htmlFor="landmark" className={field.label}>
            Landmark (shown publicly — don't enter a house number)
          </label>
          <input
            id="landmark"
            maxLength={120}
            value={form.landmark}
            onChange={(e) => set("landmark", e.target.value)}
            placeholder="e.g. Near Merkato central taxi stand"
            className={field.input}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="starts" className={field.label}>
              Starts
            </label>
            <input
              id="starts"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
              className={field.input}
            />
          </div>
          <div>
            <label htmlFor="ends" className={field.label}>
              Ends
            </label>
            <input
              id="ends"
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set("endsAt", e.target.value)}
              className={field.input}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="paytype" className={field.label}>
              Pay type
            </label>
            <select
              id="paytype"
              value={form.payType}
              onChange={(e) => set("payType", e.target.value as PayType)}
              className={field.select}
            >
              {PAY_TYPES.map((p) => (
                <option key={p} value={p}>
                  {PAY_TYPE_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="paymin" className={field.label}>
              Amount (ETB)
            </label>
            <input
              id="paymin"
              type="number"
              min={0}
              value={form.payMin}
              onChange={(e) => set("payMin", e.target.value)}
              placeholder="650"
              className={field.input}
            />
          </div>
          <div>
            <label htmlFor="paymax" className={field.label}>
              Up to (optional)
            </label>
            <input
              id="paymax"
              type="number"
              min={0}
              value={form.payMax}
              onChange={(e) => set("payMax", e.target.value)}
              className={field.input}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="terms" className={field.label}>
              Payment terms
            </label>
            <select
              id="terms"
              value={form.paymentTerms}
              onChange={(e) => set("paymentTerms", e.target.value)}
              className={field.select}
            >
              {PAYMENT_TERMS.map((term) => (
                <option key={term}>{term}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="workers" className={field.label}>
              Workers needed
            </label>
            <input
              id="workers"
              type="number"
              min={1}
              max={100}
              value={form.workersNeeded}
              onChange={(e) => set("workersNeeded", e.target.value)}
              className={field.input}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
          <input type="checkbox" checked={form.negotiable} onChange={(e) => set("negotiable", e.target.checked)} />
          Allow applicants to propose a different amount
        </label>

        <div>
          <label htmlFor="desc" className={field.label}>
            Task description
          </label>
          <textarea
            id="desc"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What needs doing, what to bring, any requirements..."
            className={field.textarea}
          />
        </div>

        <p className="text-[11px] text-zinc-500">
          Payments are arranged directly between you and the worker during the pilot; the platform does not hold money.
        </p>

        {error && <ErrorBox message={error} />}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={btn.ghost}>
            Cancel
          </button>
          {!job && (
            <button type="button" disabled={busy} onClick={(e) => submit(e, false)} className={btn.light}>
              Save draft
            </button>
          )}
          <button type="submit" disabled={busy} className={btn.primary}>
            {job ? "Save changes" : "Publish Job"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
