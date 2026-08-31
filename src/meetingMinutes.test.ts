import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatMeetingMinutes, generateMeetingMinutes } from "./meetingMinutes";
import type { Task } from "./types";

const task: Task = {
  _key: "task-key",
  ID: "12",
  Action: "Confirm launch plan",
  "Email Subject": "",
  "Last edited time": "",
  Owner: "Alex",
  Priority: "High",
  Project: "Launch",
  Status: "In progress",
  Update: "Draft is under review.",
  "Update History": "",
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("crypto", { randomUUID: () => "generated-id" });
});

describe("meeting minute generation", () => {
  it("normalizes a confident existing-action suggestion to its task key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  title: "Launch review",
                  meetingDate: "2026-08-28",
                  attendees: ["Alex"],
                  summary: "The launch plan was reviewed.",
                  discussionPoints: ["The draft is under review."],
                  decisions: [],
                  actions: [
                    {
                      action: "Confirm launch plan",
                      owner: "Alex",
                      dueDate: "Friday",
                      priority: "High",
                      context: "Alex will confirm the plan by Friday.",
                      existingActionId: "Action #12",
                      matchConfidence: 0.9,
                      matchReason: "The same deliverable and owner.",
                    },
                  ],
                }),
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const result = await generateMeetingMinutes(
      "Alex: I will confirm the launch plan by Friday after reviewing the draft.",
      "Launch",
      [task],
    );

    expect(result.actions[0]?.suggestedTaskKey).toBe("task-key");
    expect(formatMeetingMinutes(result, "Launch")).toContain("# Launch review");
  });

  it("rejects an unconfirmed project before contacting the model", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateMeetingMinutes(
        "This is a sufficiently long meeting transcript for analysis.",
        "",
        [],
      ),
    ).rejects.toThrow("Confirm the relevant project");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
