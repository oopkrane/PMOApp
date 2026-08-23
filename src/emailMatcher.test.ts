import { afterEach, describe, expect, it, vi } from "vitest";
import { matchEmailToAction } from "./emailMatcher";
import type { ProjectEmail } from "./gmail";
import type { Task } from "./types";

const task: Task = {
  _key: "task-10",
  ID: "10",
  Action: "Complete launch checklist",
  "Email Subject": "",
  "Last edited time": "",
  Owner: "Owner",
  Priority: "High",
  Project: "Project A",
  Status: "In progress",
  Update: "",
  "Update History": "",
};

const email: ProjectEmail = {
  messageId: "message-1",
  project: "Project A",
  subject: "Project A launch checklist",
  content: "The launch checklist is complete.",
  receivedAt: new Date(2026, 7, 22),
};

afterEach(() => vi.restoreAllMocks());

function mockModel(content: object) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: { content: JSON.stringify(content) } }),
          { status: 200 },
        ),
      ),
  );
}

describe("email-to-action matching", () => {
  it("accepts only a confident reference to an existing project action", async () => {
    mockModel({
      actionId: "10",
      confidence: 0.92,
      update: "The launch checklist was confirmed complete.",
      reason: "The email explicitly names the checklist.",
      newAction: "",
      priority: "",
    });
    const result = await matchEmailToAction(email, [task], "qwen3:4b");
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.taskKey).toBe("task-10");
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).model,
    ).toBe("qwen3:4b");
  });

  it("creates an action for a low-confidence or invented match", async () => {
    mockModel({
      actionId: "999",
      confidence: 0.4,
      update: "Uncertain update.",
      reason: "No explicit overlap.",
      newAction: "Review launch readiness",
      priority: "",
    });
    const result = await matchEmailToAction(email, [task]);
    expect(result).toEqual(
      expect.objectContaining({
        kind: "create",
        action: "Review launch readiness",
      }),
    );
  });
});
