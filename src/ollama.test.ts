// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OLLAMA_MODEL,
  loadOllamaModel,
  saveOllamaModel,
  scanInstalledOllamaModels,
} from "./ollama";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("Ollama model configuration", () => {
  it("uses the existing model as a safe default and persists a selection", () => {
    expect(loadOllamaModel()).toBe(DEFAULT_OLLAMA_MODEL);
    saveOllamaModel("qwen3:4b");
    expect(loadOllamaModel()).toBe("qwen3:4b");
  });

  it("validates and maps locally installed models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              {
                name: "qwen3.5:9b",
                size: 6_000_000_000,
                modified_at: "2026-08-23T00:00:00Z",
                details: {
                  family: "qwen3",
                  parameter_size: "9B",
                  quantization_level: "Q4_K_M",
                },
              },
            ],
          }),
        ),
      ),
    );

    await expect(scanInstalledOllamaModels()).resolves.toEqual([
      {
        name: "qwen3.5:9b",
        size: 6_000_000_000,
        modifiedAt: "2026-08-23T00:00:00Z",
        family: "qwen3",
        parameterSize: "9B",
        quantization: "Q4_K_M",
      },
    ]);
  });
});
