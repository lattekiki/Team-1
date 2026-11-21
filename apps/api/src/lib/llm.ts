import type { AssistKind } from "@team1/shared";
import { env } from "../env.ts";

export type AssistInput = {
  kind: AssistKind;
  language: string;
  title: string;
  description: string;
  area: string;
  categoryName: string;
  notes: string;
  workerBio: string;
  workerSkills: string[];
  username: string;
};

function langName(code: string) {
  return code === "am" ? "Amharic" : code === "om" ? "Afaan Oromoo" : "English";
}

function clip(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function templateDraft(input: AssistInput): string {
  const title = input.title || "this job";
  const area = input.area || "Jimma";
  const extra = input.notes || input.description;

  if (input.kind === "job_description") {
    const bits = [
      `Looking for help with ${title} in ${area}.`,
      extra ? extra : `Category: ${input.categoryName || "general work"}.`,
      "Meet at the agreed public landmark. Hours and pay as posted. Do not share a house number or phone in this listing.",
    ];
    return clip(bits.filter(Boolean).join(" "), 800);
  }

  const skills = input.workerSkills.length ? `Skills: ${input.workerSkills.join(", ")}.` : "";
  const bio = input.workerBio ? input.workerBio : `I am ${input.username || "available"} and can start when you need.`;
  return clip(
    `Hello, I am applying for ${title} in ${area}. ${bio} ${skills} I can discuss timing and the posted pay.`.replace(/\s+/g, " "),
    400,
  );
}

export async function llmChat(system: string, user: string, maxTokens = 400): Promise<string> {
  const res = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      temperature: 0.3,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (!res.ok) throw new Error(body.error?.message || `LLM request failed (${res.status})`);
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("LLM returned an empty draft");
  return text;
}

export function llmEnabled() {
  return env.LLM_PROVIDER === "openai" && Boolean(env.LLM_API_KEY);
}

async function openaiDraft(input: AssistInput): Promise<string> {
  const max = input.kind === "job_description" ? 800 : 400;
  const role =
    input.kind === "job_description"
      ? "Write a short job posting description for HojiiGO, a Jimma work marketplace."
      : "Write a short application pitch from a worker to an employer on HojiiGO.";
  const system = `${role} Write in ${langName(input.language)}. Plain text only, no bullets unless needed. Do not include phone numbers, emails, house numbers, or payment account details. Keep it under ${max} characters.`;
  const user = JSON.stringify({
    title: input.title,
    area: input.area,
    category: input.categoryName,
    existingText: input.notes || input.description,
    workerBio: input.workerBio,
    workerSkills: input.workerSkills,
  });
  return clip(await llmChat(system, user, 400), max);
}

export async function draftAssist(input: AssistInput): Promise<{ text: string; provider: string }> {
  if (env.LLM_PROVIDER === "off") throw new Error("Writing assist is disabled");
  if (env.LLM_PROVIDER === "openai") {
    try {
      return { text: await openaiDraft(input), provider: "openai" };
    } catch (e) {
      console.warn("[llm] openai failed, falling back to template:", e instanceof Error ? e.message : e);
      return { text: templateDraft(input), provider: "template" };
    }
  }
  return { text: templateDraft(input), provider: "template" };
}

export function assistConfig() {
  return {
    enabled: env.LLM_PROVIDER !== "off",
    provider: env.LLM_PROVIDER,
  };
}
