// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiInsightResult, SavedAiInsight } from "./insights";
import type { Task } from "./types";

const testState = vi.hoisted(() => ({
  saved: null as SavedAiInsight | null,
}));

const tasks: Task[] = [1, 2, 3].map((id) => ({
  _key: `key-${id}`,
  ID: String(id),
  Action: `Action ${id}`,
  "Email Subject": "",
  "Last edited time": "",
  Owner: "Owner",
  Priority: "High",
  Project: "Project A",
  Status: "In progress",
  Update: "",
  "Update History": "",
}));

const result: AiInsightResult = {
  projects: [
    {
      project: "Project A",
      overview: "Project focus overview.",
      actions: tasks.map((task) => ({
        key: task._key,
        reason: "Explicit high priority.",
        nextStep: "Confirm the next step.",
        source: "model" as const,
      })),
    },
  ],
};

vi.mock("./data", () => ({
  clearSavedTasks: vi.fn(async () => undefined),
  exportCsv: vi.fn(() => ""),
  loadSeedTasks: vi.fn(async () => tasks),
  parseCsv: vi.fn(),
  requestPersistentTaskStorage: vi.fn(async () => true),
  saveTasks: vi.fn(async () => undefined),
}));

vi.mock("./insights", () => ({
  generateProjectInsights: vi.fn(async () => result),
  insightModelName: "qwen3.5:9b",
  loadSavedInsights: () => testState.saved,
  saveInsights: (
    savedResult: AiInsightResult,
    generatedAt: Date,
    stale: boolean,
  ) => {
    testState.saved = { result: savedResult, generatedAt, stale };
  },
}));

import App from "./App";

beforeEach(() => {
  window.localStorage.clear();
  testState.saved = null;
});

afterEach(() => cleanup());

describe("AI Focus view persistence", () => {
  it("restores the generated board after the application remounts", async () => {
    const firstRender = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /AI Focus/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Generate focus board/i }),
    );
    expect(await screen.findByText("Top 3 actions")).toBeInTheDocument();
    await waitFor(() => expect(testState.saved).not.toBeNull());

    firstRender.unmount();
    render(<App />);

    expect(await screen.findByText("Top 3 actions")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Refresh insights/i }),
    ).toBeInTheDocument();
  });
});

describe("Gmail setup", () => {
  it("opens the configuration page from the sidebar", async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Gmail setup/i }),
    );

    expect(
      screen.getByRole("heading", { name: "Gmail setup" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Gmail account")).toHaveValue(
      "oopkrane@gmail.com",
    );
    expect(
      screen.getByRole("button", { name: /Test connection/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Unread · Primary category only"),
    ).toBeInTheDocument();
  });
});
