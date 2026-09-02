import { describe, expect, it } from "vitest";
import { chatContentToHtml, parseChatContent } from "./chatFormatting";

describe("Ask PMO response formatting", () => {
  const response = [
    "The following actions need attention:",
    "",
    "1. Confirm the delivery date.",
    "2. Review the project plan.",
    "",
    "Both actions are in progress.",
  ].join("\n");

  it("turns numbered response lines into a semantic list", () => {
    expect(parseChatContent(response)).toEqual([
      { type: "paragraph", text: "The following actions need attention:" },
      {
        type: "ordered-list",
        start: 1,
        items: ["Confirm the delivery date.", "Review the project plan."],
      },
      { type: "paragraph", text: "Both actions are in progress." },
    ]);
  });

  it("creates Word-friendly clipboard HTML and escapes model text", () => {
    expect(chatContentToHtml(`${response}\n- Owner <PMO>`)).toBe(
      "<p>The following actions need attention:</p>" +
        "<ol><li>Confirm the delivery date.</li><li>Review the project plan.</li></ol>" +
        "<p>Both actions are in progress.</p>" +
        "<ul><li>Owner &lt;PMO&gt;</li></ul>",
    );
  });
});
