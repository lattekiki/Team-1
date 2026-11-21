import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.ts";
import { templateDraft } from "../src/lib/llm.ts";

const app = createApp();

describe("writing assist", () => {
  it("builds a local job description without an LLM", () => {
    const text = templateDraft({
      kind: "job_description",
      language: "en",
      title: "Kitchen sink leak",
      description: "",
      area: "Merkato",
      categoryName: "Plumbing",
      notes: "Tap drips overnight",
      workerBio: "",
      workerSkills: [],
      username: "shop",
    });
    expect(text).toMatch(/Kitchen sink leak/);
    expect(text).toMatch(/Merkato/);
    expect(text.toLowerCase()).not.toMatch(/\+251/);
  });

  it("drafts an apply message from the signed-in worker", async () => {
    const phone = "+251912009901";
    const agent = request.agent(app);
    const otp = await agent.post("/api/auth/otp/request").send({ phone }).expect(200);
    await agent.post("/api/auth/otp/verify").send({ phone, code: otp.body.devCode, username: "assist_hand" }).expect(200);
    await agent.put("/api/me/worker-profile").send({ bio: "I fix pipes", area: "Merkato" }).expect(200);

    const cfg = await request(app).get("/api/assist/config").expect(200);
    expect(cfg.body).toMatchObject({ enabled: true, provider: "template" });

    const draft = await agent
      .post("/api/assist")
      .send({ kind: "apply_message", title: "Fix leaky sink", area: "Merkato" })
      .expect(200);
    expect(draft.body.provider).toBe("template");
    expect(draft.body.text).toMatch(/Fix leaky sink/);
    expect(draft.body.text).toMatch(/pipes/i);
  });
});
