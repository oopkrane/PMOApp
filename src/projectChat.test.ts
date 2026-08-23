import { afterEach, describe, expect, it, vi } from "vitest";
import { askProjectActions } from "./projectChat";
import type { Task } from "./types";

const task: Task = {
  _key: "task-42",
  ID: "42",
  Action: "Approve launch plan",
  "Email Subject": "",
  "Last edited time": "2026-08-22",
  Owner: "Owner",
  Priority: "High",
  Project: "Launch",
  Status: "In progress",
  Update: "Plan is ready for approval.",
  "Update History": "",
};

afterEach(() => vi.restoreAllMocks());

describe("project action assistant", () => {
  it("returns validated answers with existing action references", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                answer: "Action 42 is high priority and awaiting approval.",
                confidence: "high",
                references: [
                  { actionId: "42", relevance: "Supports the status summary." },
                ],
              }),
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const answer = await askProjectActions(
      "What needs attention?",
      [task],
      [],
      "qwen3:4b",
    );
    expect(answer.references[0]?.taskKey).toBe("task-42");
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).model,
    ).toBe("qwen3:4b");
  });

  it("removes invented action references", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                answer: "No supported answer.",
                confidence: "low",
                references: [
                  { actionId: "999", relevance: "Invented reference." },
                ],
              }),
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const answer = await askProjectActions("What changed?", [task], []);
    expect(answer.references).toEqual([]);
  });
});
