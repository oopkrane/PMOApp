import { afterEach, describe, expect, it, vi } from "vitest";
import { generateProjectInsights } from "./insights";
import type { Task } from "./types";

function task(key: string, id: string): Task {
  return {
    _key: key,
    ID: id,
    Action: `Action ${id}`,
    Owner: "Owner",
    Priority: "High",
    Project: "Project A",
    Status: "In progress",
    Update: "Recorded update",
    "Update History": "Recorded history",
    "Email Subject": "",
    "Last edited time": "",
  };
}

const tasks = [task("key-1", "1"), task("key-2", "2"), task("key-3", "3")];

afterEach(() => vi.restoreAllMocks());

describe("local AI insight boundary", () => {
  it("accepts a complete, schema-valid project ranking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "qwen3.5:9b",
            message: {
              content: JSON.stringify({
                projects: [
                  {
                    project: "Project A",
                    overview: "Three high-priority actions need attention.",
                    actions: tasks.map((item) => ({
                      id: item.ID,
                      reason: "High priority is explicitly recorded.",
                      nextStep: "Confirm the next accountable step.",
                    })),
                  },
                ],
              }),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await generateProjectInsights(tasks);
    expect(result.projects[0]?.actions).toHaveLength(3);
    expect(result.projects[0]?.actions[0]?.key).toBe("key-1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/ollama/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fills an invented model reference using recorded priority", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "qwen3.5:9b",
            message: {
              content: JSON.stringify({
                projects: [
                  {
                    project: "Project A",
                    overview: "A ranking.",
                    actions: [
                      { id: "999", reason: "Reason", nextStep: "Next" },
                      { id: "2", reason: "Reason", nextStep: "Next" },
                      { id: "3", reason: "Reason", nextStep: "Next" },
                    ],
                  },
                ],
              }),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await generateProjectInsights(tasks);
    expect(result.projects[0]?.actions).toHaveLength(3);
    expect(
      result.projects[0]?.actions.find((action) => action.key === "key-1")
        ?.source,
    ).toBe("priority-fallback");
  });
});
