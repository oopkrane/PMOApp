// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  loadSavedProjectChatMessages,
  saveProjectChatMessages,
  type ProjectChatMessage,
} from "./projectChat";

beforeEach(() => window.localStorage.clear());

describe("validated Ask PMO persistence", () => {
  it("round-trips chat messages and references", () => {
    const messages: ProjectChatMessage[] = [
      { id: "question-1", role: "user", content: "What needs attention?" },
      {
        id: "answer-1",
        role: "assistant",
        content: "Action 1 needs attention.",
        confidence: "high",
        references: [
          {
            actionId: "1",
            taskKey: "key-1",
            relevance: "High priority",
          },
        ],
      },
    ];

    saveProjectChatMessages(messages);

    expect(loadSavedProjectChatMessages()).toEqual(messages);
  });

  it("clears saved messages and rejects corrupt browser data", () => {
    saveProjectChatMessages([
      { id: "answer-1", role: "assistant", content: "Saved answer" },
    ]);
    saveProjectChatMessages([]);
    expect(loadSavedProjectChatMessages()).toEqual([]);

    window.localStorage.setItem("pmo-workspace.ask-pmo.v1", "not-json");
    expect(loadSavedProjectChatMessages()).toEqual([]);
  });
});
