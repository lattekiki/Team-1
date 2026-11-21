import { describe, expect, it } from "vitest";
import {
  mergeLlmOrder,
  scoreApplicantForJob,
  scoreJobForWorker,
  suggestCategorySlugs,
  templateMatchBlurb,
} from "../src/lib/matching.ts";
import type { WorkerTrust } from "../src/lib/eligibility.ts";

const trust: WorkerTrust = {
  active: true,
  identityVerified: false,
  highTrustApproved: false,
  skillCategoryIds: new Set([6]),
};

const worker = {
  area: "Merkato",
  travelKm: 5,
  skillCategoryIds: new Set([6]),
  completedCategoryIds: new Set([6]),
};

describe("matching", () => {
  it("filters VIP jobs that the worker is not eligible for", () => {
    expect(
      scoreJobForWorker(worker, trust, {
        categoryId: 14,
        tier: "vip",
        area: "Merkato",
        lat: null,
        lng: null,
      }),
    ).toBeNull();
  });

  it("scores skill, similar work, and same area together", () => {
    const match = scoreJobForWorker(worker, trust, {
      categoryId: 6,
      tier: "skilled",
      area: "Merkato",
      lat: null,
      lng: null,
    });
    expect(match?.reasons).toEqual(expect.arrayContaining(["skill", "similar_work", "same_area"]));
    expect(match!.score).toBeGreaterThanOrEqual(80);
  });

  it("does not hide a new applicant with no reviews", () => {
    const match = scoreApplicantForJob(
      { categoryId: 3, area: "Kochi" },
      { area: "Hermata", skillCategoryIds: [], completedInCategory: 0 },
    );
    expect(match.reasons.length).toBeGreaterThan(0);
    expect(match.score).toBeGreaterThan(0);
  });

  it("suggests plumbing from leaky sink wording", () => {
    const [top] = suggestCategorySlugs("Kitchen sink leak", "Need a plumber to fix the pipe");
    expect(top?.slug).toBe("plumbing");
  });

  it("keeps every item when merging an LLM order", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(mergeLlmOrder(items, ["c", "unknown", "a"]).map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("writes a template blurb from reasons", () => {
    const blurb = templateMatchBlurb({
      title: "Fix leaky sink",
      area: "Merkato",
      reasons: ["skill", "same_area"],
    });
    expect(blurb).toMatch(/Fix leaky sink/);
    expect(blurb).toMatch(/Merkato/);
    expect(blurb.toLowerCase()).toMatch(/skill/);
  });
});
