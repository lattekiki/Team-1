import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { SERVICE_AREAS, PAY_TYPES, type Category, type JobSummary, type PayType } from "@team1/shared";
import { api } from "../lib/api.ts";
import { fromLocalInput, PAYMENT_TERM_KEYS, toLocalInput } from "../lib/format.ts";
import { useI18n } from "../lib/i18n.tsx";
import { en } from "../lib/locales/en.ts";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";
import { AssistButton } from "./AssistButton.tsx";
import { btn, ErrorBox, field, Modal } from "./ui.tsx";

type ShiftRow = { startsAt: string; endsAt: string };

const PAYMENT_TERMS = PAYMENT_TERM_KEYS.map((key) => en[key]);

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
  area: job?.area ?? SERVICE_AREAS[0].id,
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
  const { t, fmt } = useI18n();
  const categories = useApi<{ categories: Category[] }>("/categories");
  const toast = useToast();
  const { busy, run } = useAction();
  const [form, setForm] = useState<Form>(() => fromJob(job));
  const [bulkShifts, setBulkShifts] = useState(false);
  const [shifts, setShifts] = useState<ShiftRow[]>([
    { startsAt: "", endsAt: "" },
    { startsAt: "", endsAt: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const [suggesting, setSuggesting] = useState(false);

  const suggestCategory = async () => {
    setError(null);
    setSuggesting(true);
    try {
      const res = await api<{
        suggestions: { category: { id: number; slug: string; name: string; tier: string }; hits: number }[];
      }>("/jobs/suggest", { body: { title: form.title, description: form.description } });
      const top = res.suggestions[0];
      if (!top) {
        toast(t("postSuggestNone"), "error");
        return;
      }
      set("categoryId", String(top.category.id));
      toast(t("postSuggestApplied", { name: fmt.category(top.category.slug, top.category.name) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("postSuggestNone"));
    } finally {
      setSuggesting(false);
    }
  };

  const cats = categories.data?.categories ?? [];
  const selected = cats.find((c) => String(c.id) === form.categoryId);
  const termOptions = PAYMENT_TERMS.includes(form.paymentTerms) ? PAYMENT_TERMS : [...PAYMENT_TERMS, form.paymentTerms];
  const creating = !job;

  const baseBody = () => ({
    title: form.title,
    categoryId: Number(form.categoryId),
    area: form.area,
    landmark: form.landmark,
    payType: form.payType,
    payMin: form.payMin ? Number(form.payMin) : null,
    payMax: form.payMax ? Number(form.payMax) : form.payMin ? Number(form.payMin) : null,
    negotiable: form.negotiable,
    paymentTerms: form.paymentTerms,
    workersNeeded: Number(form.workersNeeded) || 1,
    description: form.description,
  });

  const submit = async (e: FormEvent, publish: boolean) => {
    e.preventDefault();
    setError(null);

    if (creating && bulkShifts) {
      const parsed = shifts
        .map((s) => ({
          startsAt: fromLocalInput(s.startsAt),
          endsAt: fromLocalInput(s.endsAt),
        }))
        .filter((s) => s.startsAt);
      if (parsed.length < 2) {
        setError(t("bulkNeedTwoShifts"));
        return;
      }
      const res = await run(
        () => api<{ jobs: JobSummary[] }>("/jobs/bulk", { body: { ...baseBody(), publish, shifts: parsed } }),
        setError,
      );
      if (res?.jobs?.length) {
        toast(t("toastBulkPublished", { n: res.jobs.length, title: res.jobs[0]!.title }));
        onSaved(res.jobs[0]!);
        onClose();
      }
      return;
    }

    const body = {
      ...baseBody(),
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
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
      toast(job ? t("toastJobUpdated") : publish ? t("toastJobPublished", { title: res.job.title }) : t("toastDraftSaved"));
      onSaved(res.job);
      onClose();
    }
  };

  return (
    <Modal title={job ? t("editJobTitle") : t("postTitle")} eyebrow={t("postEyebrow")} onClose={onClose} wide>
      <form onSubmit={(e) => submit(e, true)} className="mt-4 space-y-3.5">
        <div>
          <label htmlFor="title" className={field.label}>
            {t("postJobTitleLabel")}
          </label>
          <input
            id="title"
            required
            minLength={3}
            maxLength={120}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={t("postJobTitlePlaceholder")}
            className={field.input}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="category" className={field.label}>
                {t("postCategoryLabel")}
              </label>
              <button
                type="button"
                disabled={suggesting || busy || form.title.trim().length < 3}
                onClick={() => void suggestCategory()}
                className="text-[11px] font-bold text-zinc-700 hover:underline disabled:opacity-40"
              >
                {t("postSuggestCategory")}
              </button>
            </div>
            <select
              id="category"
              required
              value={form.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              className={field.select}
            >
              <option value="">{t("postCategoryChoose")}</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {fmt.category(c.slug, c.name)} ({fmt.tier(c.tier)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="area" className={field.label}>
              {t("postAreaLabel")}
            </label>
            <select id="area" value={form.area} onChange={(e) => set("area", e.target.value)} className={field.select}>
              {SERVICE_AREAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {fmt.area(a.id)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selected?.tier === "vip" && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t("postVipWarning")}</span>
          </div>
        )}
        {selected?.tier === "skilled" && <p className="text-[11px] text-zinc-500">{t("postSkilledNote")}</p>}

        <div>
          <label htmlFor="landmark" className={field.label}>
            {t("postLandmarkLabel")}
          </label>
          <input
            id="landmark"
            maxLength={120}
            value={form.landmark}
            onChange={(e) => set("landmark", e.target.value)}
            placeholder={t("postLandmarkPlaceholder")}
            className={field.input}
          />
        </div>

        {creating && (
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
            <input
              type="checkbox"
              checked={bulkShifts}
              onChange={(e) => setBulkShifts(e.target.checked)}
            />
            {t("bulkShiftsToggle")}
          </label>
        )}

        {creating && bulkShifts ? (
          <div className="space-y-3 p-3 rounded-2xl border border-zinc-200 bg-zinc-50">
            <p className="text-[11px] text-zinc-500">{t("bulkShiftsHint")}</p>
            {shifts.map((shift, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div>
                  <label className={field.label}>{t("postStarts")}</label>
                  <input
                    type="datetime-local"
                    required
                    value={shift.startsAt}
                    onChange={(e) =>
                      setShifts((rows) => rows.map((r, j) => (j === i ? { ...r, startsAt: e.target.value } : r)))
                    }
                    className={field.input}
                  />
                </div>
                <div>
                  <label className={field.label}>{t("postEnds")}</label>
                  <input
                    type="datetime-local"
                    value={shift.endsAt}
                    onChange={(e) =>
                      setShifts((rows) => rows.map((r, j) => (j === i ? { ...r, endsAt: e.target.value } : r)))
                    }
                    className={field.input}
                  />
                </div>
                <button
                  type="button"
                  disabled={shifts.length <= 2}
                  onClick={() => setShifts((rows) => rows.filter((_, j) => j !== i))}
                  className="p-2.5 rounded-xl text-zinc-500 hover:bg-zinc-200 disabled:opacity-40"
                  aria-label={t("bulkRemoveShift")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {shifts.length < 14 && (
              <button
                type="button"
                onClick={() => setShifts((rows) => [...rows, { startsAt: "", endsAt: "" }])}
                className={btn.ghost}
              >
                <Plus className="w-3.5 h-3.5" />
                {t("bulkAddShift")}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="starts" className={field.label}>
                {t("postStarts")}
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
                {t("postEnds")}
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
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="paytype" className={field.label}>
              {t("postPayType")}
            </label>
            <select
              id="paytype"
              value={form.payType}
              onChange={(e) => set("payType", e.target.value as PayType)}
              className={field.select}
            >
              {PAY_TYPES.map((p) => (
                <option key={p} value={p}>
                  {fmt.payType(p)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="paymin" className={field.label}>
              {t("postAmount")}
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
              {t("postUpTo")}
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
              {t("postPaymentTerms")}
            </label>
            <select
              id="terms"
              value={form.paymentTerms}
              onChange={(e) => set("paymentTerms", e.target.value)}
              className={field.select}
            >
              {termOptions.map((term) => (
                <option key={term} value={term}>
                  {fmt.paymentTerms(term)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="workers" className={field.label}>
              {t("postWorkersNeeded")}
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
          {t("postNegotiable")}
        </label>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="desc" className={field.label}>
              {t("postDescLabel")}
            </label>
            <AssistButton
              kind="job_description"
              disabled={busy || form.title.trim().length < 3}
              payload={{
                title: form.title,
                description: form.description,
                notes: form.description,
                area: form.area,
                categoryName: selected ? fmt.category(selected.slug, selected.name) : "",
              }}
              onDraft={(text) => set("description", text)}
            />
          </div>
          <textarea
            id="desc"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder={t("postDescPlaceholder")}
            className={field.textarea}
          />
        </div>

        <p className="text-[11px] text-zinc-500">{t("postPilotNote")}</p>

        {error && <ErrorBox message={error} />}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={btn.ghost}>
            {t("cancel")}
          </button>
          {!job && (
            <button type="button" disabled={busy} onClick={(e) => submit(e, false)} className={btn.light}>
              {t("postSaveDraft")}
            </button>
          )}
          <button type="submit" disabled={busy} className={btn.primary}>
            {job ? t("postSaveChanges") : t("postPublish")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
