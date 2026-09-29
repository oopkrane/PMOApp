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
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message: { content: JSON.stringify(content) } }),
            { status: 200 },
          ),
        ),
      ),
  );
}

describe("email-to-action matching", () => {
  it.each(["Done", " done ", "DONE", "Complete", "Completed", "Closed"])(
    "excludes %s actions from candidates and returned matches",
    async (status) => {
      mockModel({
        actionId: "10",
        confidence: 1,
        update: "Complete.",
        reason: "Same subject.",
        newAction: "Review checklist",
        priority: "",
      });
      const result = await matchEmailToAction(email, [
        { ...task, Status: status, "Email Subject": email.subject },
      ]);
      expect(result.kind).toBe("create");
      const request = JSON.parse(
        String(vi.mocked(fetch).mock.calls[0]?.[1]?.body),
      );
      expect(
        JSON.parse(
          request.messages[1].content.split("Candidate actions:\n")[1],
        ),
      ).toEqual([]);
    },
  );

  it.each(["Action 10", "10 or 11", "PMO-10"])(
    "rejects partial ID %s",
    async (id) => {
      mockModel({
        actionId: id,
        confidence: 1,
        update: "Complete.",
        reason: "Checklist.",
        newAction: "Review checklist",
        priority: "",
      });
      expect((await matchEmailToAction(email, [task])).kind).toBe("create");
    },
  );

  it("rejects ambiguous IDs and actions from other projects", async () => {
    mockModel({
      actionId: "10",
      confidence: 1,
      update: "Complete.",
      reason: "Checklist.",
      newAction: "Review checklist",
      priority: "",
    });
    expect(
      (await matchEmailToAction(email, [task, { ...task, _key: "duplicate" }]))
        .kind,
    ).toBe("create");
    expect(
      (await matchEmailToAction(email, [{ ...task, Project: "Project B" }]))
        .kind,
    ).toBe("create");
  });

  it("allows content evidence to beat an unrelated action with the same subject", async () => {
    mockModel({
      actionId: "10",
      confidence: 0.92,
      update: "Checklist complete.",
      reason: "Same checklist deliverable.",
      newAction: "",
      priority: "",
    });
    const result = await matchEmailToAction(email, [
      {
        ...task,
        ID: "11",
        _key: "task-11",
        Action: "Renew support contract",
        "Email Subject": email.subject,
      },
      task,
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        kind: "match",
        taskKey: "task-10",
        confidence: 0.92,
      }),
    );
  });

  it("accepts exact alphanumeric IDs", async () => {
    mockModel({
      actionId: "PMO-10",
      confidence: 0.92,
      update: "Checklist complete.",
      reason: "Same deliverable.",
      newAction: "",
      priority: "",
    });
    expect(
      (await matchEmailToAction(email, [{ ...task, ID: "PMO-10" }])).kind,
    ).toBe("match");
  });

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

  it("does not force an uncertain match based on subject alone", async () => {
    mockModel({
      actionId: "",
      confidence: 0.35,
      update: "The checklist owner confirmed completion.",
      reason: "The model was uncertain.",
      newAction: "Confirm checklist completion",
      priority: "",
    });
    const result = await matchEmailToAction(
      { ...email, subject: "Re: Project A launch checklist" },
      [{ ...task, "Email Subject": "FW: Project A launch checklist" }],
    );

    expect(result).toEqual(
      expect.objectContaining({
        kind: "create",
      }),
    );
  });

  it("sends likely candidates first with subject and history evidence", async () => {
    const unrelated = {
      ...task,
      _key: "task-11",
      ID: "11",
      Action: "Renew support contract",
      "Email Subject": "Project A annual support renewal",
    };
    mockModel({
      actionId: "10",
      confidence: 0.9,
      update: "The launch checklist was confirmed complete.",
      reason: "Same launch deliverable.",
      newAction: "",
      priority: "",
    });

    await matchEmailToAction(email, [unrelated, task]);

    const request = JSON.parse(
      String(vi.mocked(fetch).mock.calls[0]?.[1]?.body),
    );
    const candidateText = request.messages[1].content.split(
      "Candidate actions:\n",
    )[1];
    const candidates = JSON.parse(candidateText);
    expect(candidates[0].id).toBe("10");
    expect(candidates[0]).toEqual(
      expect.objectContaining({ emailSubject: "", recentHistory: "" }),
    );
  });

  it("does not infer a match from subject when model output is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: { content: "not json" } }), {
          status: 200,
        }),
      ),
    );

    const result = await matchEmailToAction(
      { ...email, subject: "Re: Project A launch checklist" },
      [{ ...task, "Email Subject": "Project A launch checklist" }],
    );

    expect(result).toEqual(expect.objectContaining({ kind: "create" }));
  });
});
