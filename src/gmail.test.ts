// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeGmail,
  clearCachedGmailToken,
  confirmGmailAccount,
  findUnreadProjectEmails,
} from "./gmail";

beforeEach(() => {
  clearCachedGmailToken();
  window.localStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe("Gmail data boundary", () => {
  it("reuses a valid token without forcing repeated consent", async () => {
    const prompts: Array<string | undefined> = [];
    const initTokenClient = vi.fn(
      (config: { callback(response: GoogleTokenResponse): void }) => ({
        requestAccessToken: (options?: { prompt?: string }) => {
          prompts.push(options?.prompt);
          config.callback({
            access_token: `token-${prompts.length}`,
            expires_in: 3600,
          });
        },
      }),
    );
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient,
          revoke: vi.fn(),
        },
      },
    };

    const first = await authorizeGmail("client-id", "oopkrane@gmail.com");
    const reused = await authorizeGmail("client-id", "oopkrane@gmail.com");
    expect(first).toBe(reused);
    expect(initTokenClient).toHaveBeenCalledTimes(1);
    expect(prompts).toEqual([""]);

    clearCachedGmailToken();
    await authorizeGmail("client-id", "oopkrane@gmail.com");
    expect(prompts).toEqual(["", ""]);
  });

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
