import { BadgeCheck, Briefcase, Hammer, ShieldCheck, UserRound } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import {
  EMPLOYER_TYPES,
  EXPERIENCE_LEVELS,
  JIMMA_AREAS,
  LANGUAGES,
  type EmployerType,
  type ExperienceLevel,
  type Language,
  type Me,
  type Mode,
  type Skill,
  type VerificationKind,
  type VerificationRecord,
} from "@team1/shared";
import { btn, container, ErrorBox, field, SectionTitle, Spinner, StatusPill } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useI18n } from "../lib/i18n.tsx";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";

type MyProfile = {
  worker: {
    bio: string;
    experienceLevel: ExperienceLevel;
    availability: string;
    area: string;
    landmark: string;
    travelKm: number;
    skillIds: number[];
  } | null;
  employer: { employerType: EmployerType; businessName: string | null; area: string } | null;
};

const LANGUAGE_LABEL: Record<Language, string> = { en: "English", om: "Afaan Oromoo", am: "አማርኛ" };
const VERIFICATION_KINDS: Record<Mode, VerificationKind[]> = {
  worker: ["identity", "skill", "high_trust"],
  employer: ["identity"],
};

function Card({ icon, title, children }: { icon: typeof UserRound; title: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm space-y-4">
      <SectionTitle icon={icon}>{title}</SectionTitle>
      {children}
    </div>
  );
}

function AccountForm({ user }: { user: Me }) {
  const { setUser } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [username, setUsername] = useState(user.username ?? "");
  const [language, setLanguage] = useState<Language>(user.language);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await run(() => api<{ user: Me }>("/me", { method: "PATCH", body: { username, language } }), setError);
    if (res) {
      setUser(res.user);
      toast(t("toastAccountUpdated"));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="acc-username" className={field.label}>
            {t("publicUsername")}
          </label>
          <input id="acc-username" value={username} onChange={(e) => setUsername(e.target.value)} className={field.input} />
        </div>
        <div>
          <label htmlFor="acc-lang" className={field.label}>
            {t("language")}
          </label>
          <select id="acc-lang" value={language} onChange={(e) => setLanguage(e.target.value as Language)} className={field.select}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[11px] text-zinc-500">{t("phonePrivate", { phone: user.phone })}</p>
      {error && <ErrorBox message={error} />}
      <button type="submit" disabled={busy} className={btn.primary}>
        {t("saveAccount")}
      </button>
    </form>
  );
}

function AreaSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { t, fmt } = useI18n();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field.select}>
      <option value="">{t("areaNotSet")}</option>
      {JIMMA_AREAS.map((a) => (
        <option key={a.id} value={a.id}>
          {fmt.area(a.id)}
        </option>
      ))}
    </select>
  );
}

function ProfileChooser({ mode, onChoose }: { mode: Mode; onChoose: (mode: Mode) => void }) {
  const { t } = useI18n();
  const options = [
    { mode: "worker", icon: Hammer, title: t("buildWorker"), desc: t("buildWorkerDesc") },
    { mode: "employer", icon: Briefcase, title: t("buildEmployer"), desc: t("buildEmployerDesc") },
  ] as const;
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-extrabold tracking-tight">{t("buildTitle")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label={t("buildTitle")}>
        {options.map((o) => {
          const on = mode === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChoose(o.mode)}
              className={`text-left p-5 rounded-3xl border-2 transition-all ${
                on ? "bg-zinc-900 text-white border-zinc-900 shadow-lg" : "bg-white text-zinc-900 border-zinc-200 hover:border-zinc-400"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${on ? "bg-white text-zinc-900" : "bg-zinc-100 text-zinc-900"}`}
                >
                  <o.icon className="w-4 h-4" />
                </span>
                <span className="font-extrabold">{o.title}</span>
                {on && <BadgeCheck className="w-4 h-4 text-emerald-400 ml-auto" />}
              </span>
              <span className={`block text-xs mt-2 leading-relaxed ${on ? "text-zinc-300" : "text-zinc-500"}`}>{o.desc}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-500">{t("buildSwitchNote")}</p>
    </div>
  );
}

function WorkerForm({
  initial,
  skills,
  onSaved,
}: {
  initial: NonNullable<MyProfile["worker"]>;
  skills: Skill[];
  onSaved: () => void;
}) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const { refresh } = useAuth();
  const { busy, run } = useAction();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleSkill = (id: number) =>
    set("skillIds", form.skillIds.includes(id) ? form.skillIds.filter((s) => s !== id) : [...form.skillIds, id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (await run(() => api("/me/worker-profile", { method: "PUT", body: form }), setError)) {
      toast(t("toastWorkerSaved"));
      onSaved();
      await refresh();
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="w-bio" className={field.label}>
          {t("aboutYou")}
        </label>
        <textarea
          id="w-bio"
          rows={3}
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          placeholder={t("aboutYouPlaceholder")}
          className={field.textarea}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="w-exp" className={field.label}>
            {t("experience")}
          </label>
          <select id="w-exp" value={form.experienceLevel} onChange={(e) => set("experienceLevel", e.target.value as ExperienceLevel)} className={field.select}>
            {EXPERIENCE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {fmt.experience(l)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="w-area" className={field.label}>
            {t("homeArea")}
          </label>
          <AreaSelect id="w-area" value={form.area} onChange={(v) => set("area", v)} />
        </div>
        <div>
          <label htmlFor="w-km" className={field.label}>
            {t("travelKm")}
          </label>
          <input
            id="w-km"
            type="number"
            min={0}
            max={100}
            value={form.travelKm}
            onChange={(e) => set("travelKm", Number(e.target.value))}
            className={field.input}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="w-avail" className={field.label}>
            {t("availability")}
          </label>
          <input
            id="w-avail"
            value={form.availability}
            onChange={(e) => set("availability", e.target.value)}
            placeholder={t("availabilityPlaceholder")}
            className={field.input}
          />
        </div>
        <div>
          <label htmlFor="w-landmark" className={field.label}>
            {t("landmarkOptional")}
          </label>
          <input id="w-landmark" value={form.landmark} onChange={(e) => set("landmark", e.target.value)} className={field.input} />
        </div>
      </div>
      <fieldset>
        <legend className={field.label}>{t("skillsLegend")}</legend>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => {
            const on = form.skillIds.includes(s.id);
            return (
              <button
                type="button"
                key={s.id}
                aria-pressed={on}
                onClick={() => toggleSkill(s.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                  on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
                }`}
              >
                {on ? "✓ " : ""}
                {fmt.skill(s.slug, s.name)}
              </button>
            );
          })}
        </div>
      </fieldset>
      {error && <ErrorBox message={error} />}
      <button type="submit" disabled={busy} className={btn.primary}>
        {t("saveWorker")}
      </button>
    </form>
  );
}

function EmployerForm({ initial, onSaved }: { initial: NonNullable<MyProfile["employer"]>; onSaved: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [form, setForm] = useState({ ...initial, businessName: initial.businessName ?? "" });
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = { ...form, businessName: form.businessName || null };
    if (await run(() => api("/me/employer-profile", { method: "PUT", body }), setError)) {
      toast(t("toastEmployerSaved"));
      onSaved();
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="e-type" className={field.label}>
            {t("hireAs")}
          </label>
          <select
            id="e-type"
            value={form.employerType}
            onChange={(e) => setForm((f) => ({ ...f, employerType: e.target.value as EmployerType }))}
            className={field.select}
          >
            {EMPLOYER_TYPES.map((type) => (
              <option key={type} value={type}>
                {fmt.employerType(type)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="e-name" className={field.label}>
            {t("businessName")}
          </label>
          <input
            id="e-name"
            value={form.businessName}
            onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
            className={field.input}
          />
        </div>
        <div>
          <label htmlFor="e-area" className={field.label}>
            {t("area")}
          </label>
          <AreaSelect id="e-area" value={form.area} onChange={(v) => setForm((f) => ({ ...f, area: v }))} />
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      <button type="submit" disabled={busy} className={btn.primary}>
        {t("saveEmployer")}
      </button>
    </form>
  );
}

function VerificationSection({ user, mode }: { user: Me; mode: Mode }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const records = useApi<{ records: VerificationRecord[] }>("/me/verification");
  const [kind, setKind] = useState<VerificationKind | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const kinds = VERIFICATION_KINDS[mode];
  const list = (records.data?.records ?? []).filter((r) => kinds.includes(r.kind));
  const pendingKinds = new Set(list.filter((r) => r.status === "pending").map((r) => r.kind));
  const done: Record<VerificationKind, boolean> = {
    identity: user.identityVerified,
    high_trust: user.highTrustApproved,
    skill: false,
  };
  const activeKind = kind && kinds.includes(kind) ? kind : null;
  const desc = (k: VerificationKind) =>
    k === "identity" && mode === "employer" ? t("verif_identity_employer_desc") : t(`verif_${k}_desc`);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeKind) return;
    setError(null);
    if (await run(() => api("/verification", { body: { kind: activeKind, note } }), setError)) {
      toast(t("toastVerifSent"));
      setKind(null);
      setNote("");
      records.reload();
    }
  };

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 gap-3 ${kinds.length > 1 ? "md:grid-cols-3" : ""}`}>
        {kinds.map((k) => {
          const blocked = k === "high_trust" && !user.identityVerified;
          return (
            <div key={k} className={`p-4 rounded-2xl border ${activeKind === k ? "border-zinc-900" : "border-zinc-200"} bg-zinc-50`}>
              <p className="text-sm font-bold flex items-center gap-2">
                {done[k] && <BadgeCheck className="w-4 h-4 text-emerald-600" />}
                {t(`verif_${k}_title`)}
              </p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{desc(k)}</p>
              <div className="mt-3">
                {done[k] ? (
                  <StatusPill tone="good">{t("approved")}</StatusPill>
                ) : pendingKinds.has(k) ? (
                  <StatusPill tone="warn">{t("underReview")}</StatusPill>
                ) : blocked ? (
                  <span className="text-[11px] font-semibold text-zinc-500">{t("verifyIdentityFirst")}</span>
                ) : (
                  <button type="button" onClick={() => setKind(k)} className={btn.light}>
                    {t("request")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {activeKind && (
        <form onSubmit={submit} className="space-y-3 p-4 rounded-2xl border border-zinc-200">
          <label htmlFor="v-note" className={field.label}>
            {t("verifWhatLabel", { kind: t(`verif_${activeKind}_title`) })}
          </label>
          <textarea
            id="v-note"
            rows={3}
            required
            minLength={5}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(`verif_${activeKind}_placeholder`)}
            className={field.textarea}
          />
          <p className="text-[11px] text-zinc-500">{t("verifNoIds")}</p>
          {error && <ErrorBox message={error} />}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={btn.primary}>
              {t("sendRequest")}
            </button>
            <button type="button" onClick={() => setKind(null)} className={btn.ghost}>
              {t("cancel")}
            </button>
          </div>
        </form>
      )}

      {list.length > 0 && (
        <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-2xl">
          {list.map((r) => (
            <li key={r.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                <strong>{t(`verif_${r.kind}_title`)}</strong> • {t("requestedOn", { date: fmt.date(r.createdAt) })}
                {r.reviewNote && <span className="text-zinc-500"> • “{r.reviewNote}”</span>}
              </span>
              <StatusPill tone={r.status === "approved" ? "good" : r.status === "rejected" ? "bad" : "warn"}>
                {fmt.verifStatus(r.status)}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { user, setMode } = useAuth();
  const { t } = useI18n();
  const profile = useApi<MyProfile>("/me/profile");
  const skills = useApi<{ skills: Skill[] }>("/skills");
  const ready = Boolean(profile.data && skills.data);

  if (!user) return null;
  const mode = user.activeMode;

  return (
    <section className="py-12">
      <div className={`${container} max-w-4xl space-y-6`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{t("profileTitle")}</h1>
            <p className="text-sm text-zinc-500 mt-1">{t("profileSubtitle")}</p>
          </div>
          <Link to={`/u/${user.username}`} className={btn.light}>
            {t("viewPublicProfile")}
          </Link>
        </div>

        <Card icon={UserRound} title={t("account")}>
          <AccountForm key={user.language} user={user} />
        </Card>

        <ProfileChooser mode={mode} onChoose={(next) => next !== mode && setMode(next)} />

        {!ready ? (
          <Spinner />
        ) : mode === "worker" ? (
          <Card icon={Hammer} title={t("buildWorker")}>
            <WorkerForm
              initial={
                profile.data!.worker ?? {
                  bio: "",
                  experienceLevel: "beginner",
                  availability: "",
                  area: "",
                  landmark: "",
                  travelKm: 5,
                  skillIds: [],
                }
              }
              skills={skills.data!.skills}
              onSaved={profile.reload}
            />
          </Card>
        ) : (
          <Card icon={Briefcase} title={t("buildEmployer")}>
            <EmployerForm
              initial={profile.data!.employer ?? { employerType: "individual", businessName: null, area: "" }}
              onSaved={profile.reload}
            />
          </Card>
        )}

        <Card icon={ShieldCheck} title={t("verificationTitle")}>
          <VerificationSection user={user} mode={mode} />
        </Card>
      </div>
    </section>
  );
}
