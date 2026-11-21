import {
  Baby,
  Brush,
  Bus,
  Camera,
  CheckCircle2,
  GraduationCap,
  Hammer,
  House,
  LoaderCircle,
  Package,
  Palette,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  Users,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { Tier } from "@team1/shared";
import { useI18n } from "../lib/i18n.tsx";

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed",
  light:
    "inline-flex items-center justify-center gap-1.5 bg-white hover:bg-zinc-100 text-zinc-900 text-xs font-bold px-3.5 py-2 rounded-xl border border-zinc-200 transition-all disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 disabled:opacity-50",
  danger:
    "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50",
};

export const field = {
  label: "block text-xs font-bold text-zinc-700 mb-1.5",
  input:
    "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:border-zinc-900",
  select:
    "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-zinc-900",
  textarea:
    "w-full rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 focus:outline-none focus:border-zinc-900",
};

export const container = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8";

export function TrustTierBadge({ tier, dark = false }: { tier: Tier; dark?: boolean }) {
  const { fmt } = useI18n();
  const base = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-tight";
  if (tier === "vip") {
    return (
      <span
        className={`${base} ${dark ? "bg-amber-500/20 text-amber-300 border border-amber-400/30" : "bg-amber-50 text-amber-900 border border-amber-200"}`}
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        {fmt.tier("vip")}
      </span>
    );
  }
  if (tier === "skilled") {
    return (
      <span
        className={`${base} ${dark ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        {fmt.tier("skilled")}
      </span>
    );
  }
  return (
    <span
      className={`${base} ${dark ? "bg-white/10 text-zinc-200 border border-white/15" : "bg-zinc-100 text-zinc-700 border border-zinc-200"}`}
    >
      <CheckCircle2 className="w-3.5 h-3.5" />
      {fmt.tier("ordinary")}
    </span>
  );
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  errands: Package,
  "event-support": Users,
  "shop-help": ShoppingBag,
  delivery: Truck,
  "shop-cleaning": Brush,
  plumbing: Wrench,
  electrical: Zap,
  repair: Hammer,
  tutoring: GraduationCap,
  photography: Camera,
  design: Palette,
  "household-cleaning": House,
  "household-help": House,
  childcare: Baby,
  "school-pickup": Bus,
};

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = CATEGORY_ICONS[slug] ?? Package;
  return <Icon className={className} />;
}

export function Rating({ value, count, dark = false }: { value: number | null; count?: number; dark?: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${dark ? "bg-white/15 text-amber-300" : "bg-amber-50 text-amber-700"}`}
    >
      <Star className="w-3 h-3 fill-current" />
      {value != null ? value.toFixed(1) : t("ratingNew")}
      {count != null && <span className="font-medium opacity-80">({count})</span>}
    </span>
  );
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "dark" }) {
  const tones = {
    neutral: "bg-zinc-100 text-zinc-700 border-zinc-200",
    good: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    bad: "bg-red-50 text-red-700 border-red-200",
    dark: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
  };
  return <span className={`px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white rounded-3xl ${wide ? "max-w-xl" : "max-w-lg"} w-full p-6 sm:p-7 shadow-2xl border border-zinc-200 max-h-[92vh] overflow-y-auto`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow && <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{eyebrow}</span>}
            <h3 className="text-xl font-extrabold text-zinc-900 mt-1">{title}</h3>
          </div>
          <button onClick={onClose} aria-label={t("close")} className="p-2 rounded-full hover:bg-zinc-100 text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
      <LoaderCircle className="w-4 h-4 animate-spin" />
      {label ?? t("loading")}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
      {message}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-10 px-6 rounded-3xl border border-dashed border-zinc-300 bg-white">
      <Icon className="w-6 h-6 mx-auto text-zinc-400" />
      <p className="mt-2 text-sm font-bold text-zinc-800">{title}</p>
      {children && <div className="mt-1 text-xs text-zinc-500">{children}</div>}
    </div>
  );
}

export function SectionTitle({ icon: Icon, children, aside }: { icon: LucideIcon; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {children}
      </h3>
      {aside}
    </div>
  );
}
