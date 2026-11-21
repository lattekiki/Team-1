import { Lock, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import {
  JIMMA_AREAS,
  JOB_WHEN,
  NEAR_RADIUS_KM,
  PAY_TYPES,
  TIERS,
  type Category,
  type JobSummary,
} from "@team1/shared";
import { ApplyModal } from "../components/ApplyModal.tsx";
import { JobCard } from "../components/JobCard.tsx";
import { container, EmptyState, ErrorBox, field, Spinner } from "../components/ui.tsx";
import { useAuth } from "../lib/auth.tsx";
import { useI18n } from "../lib/i18n.tsx";
import { useApi } from "../lib/useApi.ts";

const FILTER_KEYS = ["q", "category", "tier", "area", "when", "payType", "minPay", "near", "radiusKm", "eligibleOnly"] as const;
const MIN_PAY_OPTIONS = [200, 500, 1000, 2000];

export function JobsPage() {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [applying, setApplying] = useState<JobSummary | null>(null);
  const [q, setQ] = useState(params.get("q") ?? "");
  const categories = useApi<{ categories: Category[] }>("/categories");

  const query = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const v = params.get(key);
    if (v) query.set(key, v);
  }
  const jobs = useApi<{ jobs: JobSummary[] }>(`/jobs?${query}`);

  const setFilters = (updates: Partial<Record<(typeof FILTER_KEYS)[number], string>>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates) as [keyof typeof updates, string | undefined][]) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };
  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) => setFilters({ [key]: value });

  return (
    <section className="py-12 lg:py-16">
      <div className={container}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <aside className="lg:col-span-3 space-y-6 lg:sticky lg:top-24">
            <div>
              <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-zinc-900 leading-tight">
                {t("exploreTitle")} <br />
                <span className="font-extrabold">{t("exploreTitleBold")}</span>
              </h1>
              <p className="text-sm text-zinc-500 mt-3 leading-relaxed">{t("exploreSubtitle")}</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFilter("q", q.trim());
              }}
              className="flex items-center gap-2 bg-white border border-zinc-200 rounded-2xl px-3 py-2"
            >
              <Search className="w-4 h-4 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchLabel")}
                className="flex-1 text-sm focus:outline-none bg-transparent"
              />
            </form>

            <div className="bg-zinc-50 border border-zinc-200/80 rounded-3xl p-4 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {t("filterTitle")}
              </div>
              <div>
                <label htmlFor="f-cat" className={field.label}>
                  {t("filterCategory")}
                </label>
                <select
                  id="f-cat"
                  value={params.get("category") ?? ""}
                  onChange={(e) => setFilter("category", e.target.value)}
                  className={field.select}
                >
                  <option value="">{t("filterAllCategories")}</option>
                  {(categories.data?.categories ?? []).map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {fmt.category(c.slug, c.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-tier" className={field.label}>
                  {t("filterTier")}
                </label>
                <select id="f-tier" value={params.get("tier") ?? ""} onChange={(e) => setFilter("tier", e.target.value)} className={field.select}>
                  <option value="">{t("filterAllTiers")}</option>
                  {[...TIERS].reverse().map((tier) => (
                    <option key={tier} value={tier}>
                      {fmt.tier(tier)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-area" className={field.label}>
                  {t("locationLabel")}
                </label>
                <select id="f-area" value={params.get("area") ?? ""} onChange={(e) => setFilter("area", e.target.value)} className={field.select}>
                  <option value="">{t("locationAll")}</option>
                  {JIMMA_AREAS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {fmt.area(a.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-near" className={field.label}>
                  {t("filterNear")}
                </label>
                <select
                  id="f-near"
                  value={params.get("near") ?? ""}
                  onChange={(e) => {
                    const near = e.target.value;
                    if (!near) setFilters({ near: "", radiusKm: "" });
                    else setFilters({ near, radiusKm: params.get("radiusKm") || "5" });
                  }}
                  className={field.select}
                >
                  <option value="">{t("nearAny")}</option>
                  {JIMMA_AREAS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {fmt.area(a.id)}
                    </option>
                  ))}
                </select>
              </div>
              {params.get("near") && (
                <div>
                  <label htmlFor="f-radius" className={field.label}>
                    {t("filterRadius")}
                  </label>
                  <select
                    id="f-radius"
                    value={params.get("radiusKm") ?? "5"}
                    onChange={(e) => setFilter("radiusKm", e.target.value)}
                    className={field.select}
                  >
                    {NEAR_RADIUS_KM.map((km) => (
                      <option key={km} value={km}>
                        {t("radiusOption", { km })}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="f-when" className={field.label}>
                  {t("filterWhen")}
                </label>
                <select id="f-when" value={params.get("when") ?? ""} onChange={(e) => setFilter("when", e.target.value)} className={field.select}>
                  <option value="">{t("whenAny")}</option>
                  {JOB_WHEN.map((w) => (
                    <option key={w} value={w}>
                      {t(`when_${w}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-minpay" className={field.label}>
                  {t("filterMinPay")}
                </label>
                <select
                  id="f-minpay"
                  value={params.get("minPay") ?? ""}
                  onChange={(e) => setFilter("minPay", e.target.value)}
                  className={field.select}
                >
                  <option value="">{t("minPayAny")}</option>
                  {MIN_PAY_OPTIONS.map((amount) => (
                    <option key={amount} value={amount}>
                      {t("minPayOption", { amount: amount.toLocaleString("en-US") })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-pay" className={field.label}>
                  {t("filterPay")}
                </label>
                <select
                  id="f-pay"
                  value={params.get("payType") ?? ""}
                  onChange={(e) => setFilter("payType", e.target.value)}
                  className={field.select}
                >
                  <option value="">{t("filterAllPay")}</option>
                  {PAY_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {fmt.payType(p)}
                    </option>
                  ))}
                </select>
              </div>
              {user && (
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={params.get("eligibleOnly") === "1"}
                    onChange={(e) => setFilter("eligibleOnly", e.target.checked ? "1" : "")}
                  />
                  {t("filterEligible")}
                </label>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900 text-white space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Lock className="w-3.5 h-3.5" />
                {t("privacyTitle")}
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{t("privacyNote")}</p>
            </div>
          </aside>

          <div className="lg:col-span-9">
            {jobs.loading && !jobs.data ? (
              <Spinner />
            ) : jobs.error ? (
              <ErrorBox message={jobs.error.message} />
            ) : jobs.data?.jobs.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {jobs.data.jobs.map((job) => (
                  <JobCard key={job.id} job={job} onApply={setApplying} />
                ))}
              </div>
            ) : (
              <EmptyState icon={Search} title={t("noJobs")}>
                {t("noJobsHint")}
              </EmptyState>
            )}
          </div>
        </div>
      </div>
      {applying && <ApplyModal job={applying} onClose={() => setApplying(null)} onApplied={jobs.reload} />}
    </section>
  );
}
