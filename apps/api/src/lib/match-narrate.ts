import type { JobMatch } from "@team1/shared";
import { env } from "../env.ts";
import { llmChat, llmEnabled } from "./llm.ts";
import { mergeLlmOrder, templateMatchBlurb } from "./matching.ts";

type Item = {
  id: string;
  title: string;
  area: string;
  match: JobMatch;
};

function withTemplateBlurb(item: Item, subject: "job" | "applicant"): Item {
  return {
    ...item,
    match: {
      ...item.match,
      blurb:
        item.match.blurb ||
        templateMatchBlurb({
          title: item.title,
          area: item.area,
          reasons: item.match.reasons,
          subject,
        }),
    },
  };
}

function parseNarration(raw: string): { order: string[]; blurbs: Record<string, string> } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { order: [], blurbs: {} };
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      order?: unknown;
      blurbs?: unknown;
    };
    const order = Array.isArray(parsed.order) ? parsed.order.filter((x): x is string => typeof x === "string") : [];
    const blurbs: Record<string, string> = {};
    if (parsed.blurbs && typeof parsed.blurbs === "object") {
      for (const [k, v] of Object.entries(parsed.blurbs as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) blurbs[k] = v.trim().slice(0, 220);
      }
    }
    return { order, blurbs };
  } catch {
    return { order: [], blurbs: {} };
  }
}

/**
 * Optional LLM narration/reorder among an already-filtered eligible set.
 * Never adds ids, never drops ids, never uses rating as VIP eligibility.
 */
export async function narrateMatches(
  items: Item[],
  opts: { language: string; subject: "job" | "applicant" },
): Promise<Item[]> {
  const labeled = items.map((item) => withTemplateBlurb(item, opts.subject));
  if (!labeled.length || !llmEnabled()) return labeled;

  try {
    const system =
      opts.subject === "job"
        ? `You rank already-eligible HojiiGO jobs for a worker in Jimma. Write in ${opts.language === "am" ? "Amharic" : opts.language === "om" ? "Afaan Oromoo" : "English"}. Return JSON only: {"order":["id",...],"blurbs":{"id":"one sentence"}}. Use only provided ids. Do not invent jobs. Do not mention ratings as a reason someone is allowed to apply. No phone numbers.`
        : `You rank already-listed job applicants for an employer. Write in ${opts.language === "am" ? "Amharic" : opts.language === "om" ? "Afaan Oromoo" : "English"}. Return JSON only: {"order":["id",...],"blurbs":{"id":"one sentence"}}. Use only provided ids. Keep every id. Never hide someone because they have zero reviews. No phone numbers.`;
    const user = JSON.stringify(
      labeled.map((item) => ({
        id: item.id,
        title: item.title,
        area: item.area,
        score: item.match.score,
        reasons: item.match.reasons,
        blurb: item.match.blurb,
      })),
    );
    const raw = await llmChat(system, user, 500);
    const { order, blurbs } = parseNarration(raw);
    const ordered = mergeLlmOrder(labeled, order);
    return ordered.map((item) => ({
      ...item,
      match: { ...item.match, blurb: blurbs[item.id] || item.match.blurb },
    }));
  } catch (e) {
    console.warn("[match-narrate] fallback to rules:", e instanceof Error ? e.message : e);
    return labeled;
  }
}

export function matchNarrateEnabled() {
  return env.LLM_PROVIDER === "openai";
}
