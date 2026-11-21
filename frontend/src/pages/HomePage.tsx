import { ArrowRight, Briefcase, MapPin, Search, ShieldCheck, Sparkles, Unlock, UserCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { SERVICE_AREAS, type Category, type JobSummary, type PublicStats } from "@team1/shared";
import { ApplyModal } from "../components/ApplyModal.tsx";
import { HeroIllustration, HowItWorksIllustration } from "../components/Illustrations.tsx";
import { JobCard } from "../components/JobCard.tsx";
import { CategoryIcon, container } from "../components/ui.tsx";
import { useAuth } from "../lib/auth.tsx";
import { useI18n } from "../lib/i18n.tsx";
import { useApi } from "../lib/useApi.ts";

export function HomePage() {
  const { t, tp, fmt } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [applying, setApplying] = useState<JobSummary | null>(null);
  const stats = useApi<{ stats: PublicStats }>("/stats");
  const categories = useApi<{ categories: Category[] }>("/categories");
  const jobs = useApi<{ jobs: JobSummary[] }>("/jobs?limit=6");
  const recommended = useApi<{ jobs: JobSummary[] }>(user?.activeMode === "worker" ? "/me/recommended-jobs" : null);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (area) params.set("area", area);
    navigate(`/jobs?${params}`);
  };

  const s = stats.data?.stats;
  const statItems = [
    { value: s?.workers, label: t("statWorkers") },
    { value: s?.employers, label: t("statEmployers") },
    { value: s?.openJobs, label: t("statOpenJobs") },
  ];

  return (
    <>
      <section className="relative overflow-hidden pt-10 pb-14 lg:pt-16 lg:pb-20">
        <div className={container}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-100 border border-zinc-200/80 text-xs font-semibold text-zinc-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {t("heroBadge")}
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-900 leading-[1.08]">
                {t("heroTitle1")} <br />
                {t("heroTitle2")}
              </h1>
              <p className="text-base sm:text-lg text-zinc-500 max-w-xl leading-relaxed">{t("heroSubtitle")}</p>

              <form
                onSubmit={search}
                className="bg-white p-2.5 rounded-3xl sm:rounded-full shadow-[0_14px_40px_rgba(0,0,0,0.08)] border border-zinc-200/90 max-w-2xl"
              >
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 flex items-center gap-3 px-4 py-2">
                    <Briefcase className="w-4 h-4 text-zinc-400 shrink-0" />
                    <div className="w-full">
                      <label htmlFor="hero-q" className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        {t("searchLabel")}
                      </label>
                      <input
                        id="hero-q"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={t("searchPlaceholder")}
                        className="w-full text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none bg-transparent"
                      />
                    </div>
                  </div>
                  <div className="hidden sm:block w-px h-9 bg-zinc-200" />
                  <div className="flex-1 flex items-center gap-3 px-4 py-2">
                    <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
                    <div className="w-full">
                      <label htmlFor="hero-area" className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        {t("locationLabel")}
                      </label>
                      <select
                        id="hero-area"
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        className="w-full text-sm font-medium text-zinc-900 focus:outline-none bg-transparent"
                      >
                        <option value="">{t("locationAll")}</option>
                        {SERVICE_AREAS.map((a) => (
                          <option key={a.id} value={a.id}>
                            {fmt.area(a.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    aria-label={t("searchBtn")}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-4 rounded-2xl sm:rounded-full flex items-center justify-center gap-2 font-bold text-sm transition-all shadow-md shrink-0"
                  >
                    <Search className="w-4 h-4" />
                    <span className="sm:hidden">{t("searchBtn")}</span>
                  </button>
                </div>
              </form>

              <div className="pt-2 flex flex-wrap items-center gap-8 sm:gap-12">
                {statItems.map((item, i) => (
                  <div key={item.label} className="flex items-center gap-8 sm:gap-12">
                    {i > 0 && <div className="w-px h-10 bg-zinc-200 hidden sm:block" />}
                    <div>
                      <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900">{item.value ?? "–"}</p>
                      <p className="text-xs font-medium text-zinc-500 mt-0.5">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-5">
              <HeroIllustration />
            </div>
          </div>
        </div>
      </section>

      <section id="categories" className="py-16 bg-white/40 border-y border-stone-200/60">
        <div className={container}>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-zinc-900">
              {t("catTitle")} <span className="font-extrabold">{t("catTitleBold")}</span>
            </h2>
            <p className="text-sm text-zinc-500 max-w-md">{t("catSubtitle")}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {(categories.data?.categories ?? []).map((cat) => (
              <Link
                key={cat.id}
                to={`/jobs?category=${cat.slug}`}
                className="group text-left p-5 rounded-3xl border bg-white text-zinc-900 border-zinc-200/80 hover:border-zinc-900 hover:shadow-md transition-all flex flex-col justify-between min-h-[170px]"
              >
                <div>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4 bg-zinc-100 text-zinc-900 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <CategoryIcon slug={cat.slug} className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm leading-snug">{fmt.category(cat.slug, cat.name)}</h3>
                  <p className={`text-[11px] mt-1.5 font-semibold ${cat.tier === "vip" ? "text-amber-700" : "text-zinc-500"}`}>
                    {fmt.tier(cat.tier)}
                  </p>
                </div>
                <span className="pt-4 text-[11px] font-semibold text-zinc-400 group-hover:text-zinc-900 transition-colors">
                  {tp("openJobs", cat.openJobs)} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {recommended.data && recommended.data.jobs.length > 0 && (
        <section className="py-10 border-t border-stone-200/60">
          <div className={container}>
            <div className="flex items-end justify-between gap-4 mb-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900">{t("recommendedJobsTitle")}</h2>
              <Link to="/dashboard" className="text-sm font-bold text-zinc-900 hover:underline">
                {t("seeAllJobs")}
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {recommended.data.jobs.slice(0, 3).map((job) => (
                <JobCard key={job.id} job={job} onApply={setApplying} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-16">
        <div className={container}>
          <div className="flex items-end justify-between gap-4 mb-8">
            <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-zinc-900">
              {t("exploreTitle")} <span className="font-extrabold">{t("exploreTitleBold")}</span>
            </h2>
            <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-900 hover:underline">
              {t("seeAllJobs")}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {(jobs.data?.jobs ?? []).map((job, i) => (
              <JobCard key={job.id} job={job} dark={i === 0} onApply={setApplying} />
            ))}
          </div>
          {jobs.data?.jobs.length === 0 && <p className="text-sm text-zinc-500">{t("noJobs")}</p>}
        </div>
      </section>

      <section id="how-it-works" className="py-16 lg:py-24 bg-white/40 border-t border-stone-200/60">
        <div className={container}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 order-2 lg:order-1">
              <HowItWorksIllustration />
            </div>
            <div className="lg:col-span-7 order-1 lg:order-2 space-y-8">
              <div>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900">{t("howTitle")}</h2>
                <p className="text-sm sm:text-base text-zinc-500 mt-2">{t("howSubtitle")}</p>
              </div>
              <div className="space-y-6">
                {[
                  { icon: UserCheck, title: t("step1Title"), desc: t("step1Desc") },
                  { icon: ShieldCheck, title: t("step2Title"), desc: t("step2Desc") },
                  { icon: Sparkles, title: t("step3Title"), desc: t("step3Desc") },
                  { icon: Unlock, title: t("step4Title"), desc: t("step4Desc") },
                ].map((step) => (
                  <div key={step.title} className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <step.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-zinc-900">{step.title}</h3>
                      <p className="text-sm text-zinc-500 mt-1 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {applying && (
        <ApplyModal
          job={applying}
          onClose={() => setApplying(null)}
          onApplied={() => {
            jobs.reload();
            recommended.reload();
          }}
        />
      )}
    </>
  );
}
