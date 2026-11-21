import { Building2, CheckCircle2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ORG_MONTHLY_ETB } from "@team1/shared";
import { btn, container, field } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useToast } from "../lib/toast.tsx";
import { useAction } from "../lib/useApi.ts";

export function ContactPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const ok = await run(
      () =>
        api("/inquiries", {
          body: {
            organizationName: String(form.get("organizationName") ?? ""),
            contactName: String(form.get("contactName") ?? ""),
            phone: String(form.get("phone") ?? ""),
            email,
            message: String(form.get("message") ?? ""),
            workersNeeded: Number(form.get("workersNeeded") || 1),
          },
        }),
      (m) => toast(m, "error"),
    );
    if (ok) setSent(true);
  };

  return (
    <section className="py-12">
      <div className={`${container} max-w-2xl`}>
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Building2 className="w-4 h-4" />
            {t("contactTitle")}
          </div>
          <p className="text-sm text-zinc-600 mt-3 leading-relaxed">{t("contactIntro", { amount: ORG_MONTHLY_ETB.toLocaleString("en-US") })}</p>
          {sent ? (
            <p className="mt-6 flex items-start gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              {t("contactSent")}
            </p>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
              <label className="block">
                <span className={field.label}>{t("contactOrgName")}</span>
                <input name="organizationName" required minLength={2} className={field.input} />
              </label>
              <label className="block">
                <span className={field.label}>{t("contactPerson")}</span>
                <input name="contactName" required minLength={2} className={field.input} />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className={field.label}>{t("contactPhone")}</span>
                  <input name="phone" required inputMode="tel" placeholder="0911234567" className={field.input} />
                </label>
                <label className="block">
                  <span className={field.label}>{t("contactEmail")}</span>
                  <input name="email" type="email" className={field.input} />
                </label>
              </div>
              <label className="block">
                <span className={field.label}>{t("contactWorkers")}</span>
                <input name="workersNeeded" type="number" min={1} max={500} defaultValue={10} className={field.input} />
              </label>
              <label className="block">
                <span className={field.label}>{t("contactMessage")}</span>
                <textarea name="message" required minLength={10} rows={5} className={field.textarea} />
              </label>
              <button disabled={busy} className={btn.primary}>
                {t("contactSubmit")}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
