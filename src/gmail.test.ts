// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmGmailAccount, findUnreadProjectEmails } from "./gmail";

afterEach(() => vi.restoreAllMocks());

describe("Gmail data boundary", () => {
  it("confirms the authorized mailbox identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ emailAddress: "oopkrane@gmail.com" }), {
          status: 200,
        }),
      ),
    );
    await expect(
      confirmGmailAccount("short-lived-token", "oopkrane@gmail.com"),
    ).resolves.toBeUndefined();
  });

  it("fetches content only for unread messages whose subject matches a project", async () => {
    const body = window
      .btoa("The supplier confirmed that the launch checklist is complete.")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/messages?")) {
          return Promise.resolve(
            new Response(JSON.stringify({ messages: [{ id: "message-1" }] }), {
              status: 200,
            }),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "message-1",
              internalDate: "1787356800000",
              payload: {
                mimeType: "text/plain",
                headers: [{ name: "Subject", value: "Project A update" }],
                body: { data: body },
              },
            }),
            { status: 200 },
          ),
        );
      }),
    );

    const emails = await findUnreadProjectEmails("token", ["Project A"]);
    expect(emails).toHaveLength(1);
    expect(emails[0]?.project).toBe("Project A");
    expect(emails[0]?.content).toContain("launch checklist");
    const listCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes("/messages?"));
    expect(new URL(String(listCall?.[0])).searchParams.get("q")).toContain(
      "is:unread category:primary",
    );
  });
});
