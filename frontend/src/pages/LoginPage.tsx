import { Lock, Phone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { LANGUAGES, type Language, type Me } from "@team1/shared";
import { btn, ErrorBox, field } from "../components/ui.tsx";
import { api, ApiRequestError } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useI18n } from "../lib/i18n.tsx";

const LANGUAGE_LABEL: Record<Language, string> = { en: "English", om: "Afaan Oromoo", am: "አማርኛ" };

export function LoginPage() {
  const { user, setUser } = useAuth();
  const { lang, t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/dashboard";

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [username, setUsername] = useState("");
  const [language, setLanguage] = useState<Language>(lang);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ isNewUser: boolean; devCode?: string }>("/auth/otp/request", { body: { phone } });
      setDevCode(res.devCode ?? null);
      setNeedsUsername(res.isNewUser);
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ user: Me }>("/auth/otp/verify", {
        body: { phone, code, ...(needsUsername ? { username, language } : {}) },
      });
      setUser(res.user);
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "username_required") setNeedsUsername(true);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="py-16">
      <div className="max-w-md mx-auto px-4">
        <div className="bg-white border border-zinc-200 rounded-3xl p-7 shadow-sm">
          <div className="w-11 h-11 rounded-2xl bg-zinc-900 text-white flex items-center justify-center">
            <Phone className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight mt-4">{t("loginTitle")}</h1>
          <p className="text-sm text-zinc-500 mt-1">{t("loginSubtitle")}</p>

          {step === "phone" ? (
            <form onSubmit={requestCode} className="mt-6 space-y-4">
              <div>
                <label htmlFor="phone" className={field.label}>
                  {t("loginPhoneLabel")}
                </label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0911 234 567"
                  className={field.input}
                />
              </div>
              {error && <ErrorBox message={error} />}
              <button type="submit" disabled={busy} className={`${btn.primary} w-full py-3`}>
                {t("loginSendCode")}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-6 space-y-4">
              <p className="text-xs text-zinc-600">
                {t("loginCodeSent", { phone })}{" "}
                <button type="button" onClick={() => setStep("phone")} className="underline font-semibold">
                  {t("loginChange")}
                </button>
              </p>
              {devCode && (
                <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  {t("loginDevCode", { code: devCode })}
                </p>
              )}
              <div>
                <label htmlFor="code" className={field.label}>
                  {t("loginCodeLabel")}
                </label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className={`${field.input} font-mono tracking-[0.4em] text-lg`}
                />
              </div>

              {needsUsername && (
                <>
                  <div>
                    <label htmlFor="username" className={field.label}>
                      {t("loginUsernameLabel")}
                    </label>
                    <div className="flex items-center rounded-xl border border-zinc-200 focus-within:border-zinc-900 bg-white">
                      <span className="pl-3.5 text-sm text-zinc-400">@</span>
                      <input
                        id="username"
                        required
                        minLength={3}
                        maxLength={30}
                        pattern="[A-Za-z0-9_]+"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="abebe_ju"
                        className="flex-1 px-1 py-2.5 text-sm focus:outline-none bg-transparent rounded-xl"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">{t("loginUsernameHint")}</p>
                  </div>
                  <div>
                    <label htmlFor="language" className={field.label}>
                      {t("loginLanguageLabel")}
                    </label>
                    <select
                      id="language"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as Language)}
                      className={field.select}
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {LANGUAGE_LABEL[l]}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {error && <ErrorBox message={error} />}
              <button type="submit" disabled={busy} className={`${btn.primary} w-full py-3`}>
                {needsUsername ? t("loginCreate") : t("loginSignIn")}
              </button>
            </form>
          )}

          <p className="mt-6 flex items-center gap-2 text-[11px] text-zinc-500">
            <Lock className="w-3.5 h-3.5" />
            {t("loginPrivacy")}
          </p>
        </div>
      </div>
    </section>
  );
}
