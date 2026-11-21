import { Sparkles } from "lucide-react";
import { api } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useToast } from "../lib/toast.tsx";
import { useAction, useApi } from "../lib/useApi.ts";

type AssistKind = "job_description" | "apply_message";

export function AssistButton({
  kind,
  payload,
  onDraft,
  disabled,
}: {
  kind: AssistKind;
  payload: Record<string, unknown>;
  onDraft: (text: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const cfg = useApi<{ enabled: boolean; provider: string }>("/assist/config");
  const { busy, run } = useAction();
  if (cfg.data && !cfg.data.enabled) return null;

  const click = async () => {
    const res = await run(
      () => api<{ text: string; provider: string }>("/assist", { body: { kind, ...payload } }),
      (m) => toast(m, "error"),
    );
    if (res?.text) {
      onDraft(res.text);
      toast(t("assistApplied"));
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || busy || cfg.loading}
      onClick={() => void click()}
      className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-700 hover:underline disabled:opacity-40"
    >
      <Sparkles className="w-3 h-3" />
      {busy ? t("assistWorking") : t("assistWrite")}
    </button>
  );
}
