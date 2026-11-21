import { Bookmark } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useI18n } from "../lib/i18n.tsx";
import { useToast } from "../lib/toast.tsx";
import { useAction } from "../lib/useApi.ts";

export function SaveJobButton({
  jobId,
  saved: initial,
  dark = false,
  onChanged,
}: {
  jobId: string;
  saved: boolean;
  dark?: boolean;
  onChanged?: (saved: boolean) => void;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { busy, run } = useAction();
  const [saved, setSaved] = useState(initial);
  useEffect(() => setSaved(initial), [initial, jobId]);

  const toggle = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return navigate(`/login?next=/jobs/${jobId}`);
    const next = !saved;
    const ok = await run(async () => {
      await api(`/jobs/${jobId}/favorite`, { method: next ? "POST" : "DELETE" });
      return true;
    }, (m) => toast(m, "error"));
    if (ok) {
      setSaved(next);
      onChanged?.(next);
      toast(next ? t("toastJobSaved") : t("toastJobUnsaved"));
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? t("unsaveJob") : t("saveJob")}
      title={saved ? t("unsaveJob") : t("saveJob")}
      className={`p-2 rounded-full transition-colors ${
        saved
          ? dark
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-emerald-50 text-emerald-700"
          : dark
            ? "bg-white/10 text-zinc-300 hover:bg-white/20"
            : "bg-zinc-100 text-zinc-500 hover:text-zinc-900"
      }`}
    >
      <Bookmark className={`w-4 h-4 ${saved ? "fill-current" : ""}`} />
    </button>
  );
}
