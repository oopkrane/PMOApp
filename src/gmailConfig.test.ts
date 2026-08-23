// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  GmailConfigSchema,
  clearGmailConfig,
  loadGmailConfig,
  saveGmailConfig,
} from "./gmailConfig";

beforeEach(() => window.localStorage.clear());

describe("Gmail configuration", () => {
  it("validates and persists non-secret OAuth settings", () => {
    saveGmailConfig({
      accountEmail: "owner@gmail.com",
      clientId: "123-example.apps.googleusercontent.com",
    });
    expect(loadGmailConfig()).toEqual({
      accountEmail: "owner@gmail.com",
      clientId: "123-example.apps.googleusercontent.com",
    });
  });

  it("rejects client secrets and malformed client IDs", () => {
    expect(
      GmailConfigSchema.safeParse({
        accountEmail: "owner@gmail.com",
        clientId: "GOCSPX-client-secret",
      }).success,
    ).toBe(false);
  });

  it("can reset saved settings to supplied defaults", () => {
    saveGmailConfig({
      accountEmail: "owner@gmail.com",
      clientId: "123-example.apps.googleusercontent.com",
    });
    clearGmailConfig();
    expect(
      loadGmailConfig(
        "default.apps.googleusercontent.com",
        "default@gmail.com",
      ),
    ).toEqual({
      accountEmail: "default@gmail.com",
      clientId: "default.apps.googleusercontent.com",
    });
  });
});
