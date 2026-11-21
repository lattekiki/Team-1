import { describe, expect, it } from "vitest";
import { vipCategoriesEnabledFor } from "../src/lib/pilot.ts";

describe("VIP category pilot gate", () => {
  it("stays off in production unless explicitly enabled", () => {
    expect(vipCategoriesEnabledFor("production", undefined)).toBe(false);
    expect(vipCategoriesEnabledFor("production", "off")).toBe(false);
    expect(vipCategoriesEnabledFor("production", "on")).toBe(true);
  });

  it("stays on in development and test unless explicitly disabled", () => {
    expect(vipCategoriesEnabledFor("development", undefined)).toBe(true);
    expect(vipCategoriesEnabledFor("test", undefined)).toBe(true);
    expect(vipCategoriesEnabledFor("development", "off")).toBe(false);
  });
});
