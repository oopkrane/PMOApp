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
import { saveProjectChatMessages } from "./projectChat";
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

vi.mock("./ollama", () => ({
  loadOllamaModel: () => "qwen3.5:9b",
  saveOllamaModel: (model: string) => model,
  scanInstalledOllamaModels: vi.fn(async () => [
    {
      name: "qwen3.5:9b",
      size: 6_000_000_000,
      parameterSize: "9B",
      quantization: "Q4_K_M",
    },
    { name: "qwen3:4b", size: 3_000_000_000, parameterSize: "4B" },
  ]),
}));

import App from "./App";

beforeEach(() => {
  window.localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  testState.saved = null;
  tasks.forEach((task) => {
    task.Status = "In progress";
    task.Project = "Project A";
  });
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

describe("AI model setup", () => {
  it("scans installed models and applies one shared selection", async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: /AI model setup/i }),
    );

    expect(
      screen.getByRole("heading", { name: "AI model setup" }),
    ).toBeInTheDocument();
    const alternative = await screen.findByRole("radio", {
      name: /qwen3:4b/i,
    });
    fireEvent.click(alternative);
    expect(alternative).toBeChecked();
    expect(screen.getByText(/Used by AI Focus, Ask PMO/i)).toBeInTheDocument();
  });
});

describe("Ask PMO persistence", () => {
  it("keeps the previous response after the window closes and reopens", async () => {
    saveProjectChatMessages([
      {
        id: "answer-1",
        role: "assistant",
        content: "Action 1 needs attention.",
        confidence: "high",
      },
    ]);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Ask PMO/i }));
    expect(screen.getByText("Action 1 needs attention.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Action 1 needs attention.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ask PMO/i }));
    expect(screen.getByText("Action 1 needs attention.")).toBeInTheDocument();
  });
});

describe("completed action filtering", () => {
  it("hides done actions without deleting them", async () => {
    tasks[2]!.Status = "Done";
    render(<App />);

    expect(await screen.findByText("Action 3")).toBeInTheDocument();
    const toggle = screen.getByRole("checkbox", { name: /Hide done/i });
    fireEvent.click(toggle);
    expect(screen.queryByText("Action 3")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("Action 3")).toBeInTheDocument();
  });
});

describe("action search", () => {
  it("clears the search when a different project is selected", async () => {
    tasks[1]!.Project = "Project B";
    render(<App />);

    const search = await screen.findByPlaceholderText(/Search actions/i);
    fireEvent.change(search, { target: { value: "Action 1" } });
    expect(search).toHaveValue("Action 1");

    fireEvent.click(screen.getByRole("button", { name: /Project A/i }));
    expect(search).toHaveValue("");

    fireEvent.change(search, { target: { value: "Action 1" } });
    fireEvent.click(screen.getByRole("button", { name: /Project B/i }));
    expect(search).toHaveValue("");
  });
});

describe("new action creation", () => {
  it("opens with an empty focused action title", async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: /New action/i }),
    );

    const title = screen.getByRole("textbox", { name: "Action title" });
    expect(title).toHaveValue("");
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute("placeholder", "Enter action");
  });
});
