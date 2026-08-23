import { z } from "zod";

const GMAIL_CONFIG_KEY = "pmo-workspace.gmail-config.v1";

export const GmailConfigSchema = z.object({
  accountEmail: z.string().trim().email("Enter a valid Gmail address."),
  clientId: z
    .string()
    .trim()
    .min(1, "Enter a Google OAuth client ID.")
    .max(300)
    .refine(
      (value) => value.endsWith(".apps.googleusercontent.com"),
      "Use a Web application client ID ending in .apps.googleusercontent.com.",
    ),
});

export type GmailConfig = z.infer<typeof GmailConfigSchema>;

export function loadGmailConfig(
  defaultClientId = "",
  defaultEmail = "oopkrane@gmail.com",
): GmailConfig {
  try {
    const saved = window.localStorage.getItem(GMAIL_CONFIG_KEY);
    if (saved) {
      const parsed = GmailConfigSchema.safeParse(JSON.parse(saved));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Ignore invalid or unavailable browser storage and use safe defaults.
  }
  return { accountEmail: defaultEmail, clientId: defaultClientId };
}

export function saveGmailConfig(config: GmailConfig): GmailConfig {
  const validated = GmailConfigSchema.parse(config);
  window.localStorage.setItem(GMAIL_CONFIG_KEY, JSON.stringify(validated));
  return validated;
}

export function clearGmailConfig(): void {
  window.localStorage.removeItem(GMAIL_CONFIG_KEY);
}
