// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  loadSavedInsights,
  saveInsights,
  type AiInsightResult,
} from "./insights";

beforeEach(() => window.localStorage.clear());

describe("validated AI Focus persistence", () => {
  it("round-trips a generated result", () => {
    const result: AiInsightResult = {
      projects: [
        {
          project: "Project A",
          overview: "Overview",
          actions: [
            {
              key: "key-1",
              reason: "Reason",
              nextStep: "Next step",
              source: "model",
            },
          ],
        },
      ],
    };
    const generatedAt = new Date("2026-08-22T08:00:00.000Z");
    saveInsights(result, generatedAt, false);
    expect(loadSavedInsights()).toEqual({ result, generatedAt, stale: false });
  });

  it("rejects corrupt browser data", () => {
    window.localStorage.setItem("pmo-workspace.ai-focus.v1", "not-json");
    expect(loadSavedInsights()).toBeNull();
  });
});
