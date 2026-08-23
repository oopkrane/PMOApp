import { z } from "zod";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

const ProfileSchema = z.object({ emailAddress: z.string().email() });
const MessageListSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1) })).optional(),
  nextPageToken: z.string().optional(),
});

interface GmailPart {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailPart[];
}

const GmailPartSchema: z.ZodType<GmailPart> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    headers: z
      .array(z.object({ name: z.string(), value: z.string() }))
      .optional(),
    body: z.object({ data: z.string().optional() }).optional(),
    parts: z.array(GmailPartSchema).optional(),
  }),
);

const GmailMessageSchema = z.object({
  id: z.string().min(1),
  internalDate: z.string().regex(/^\d+$/).optional(),
  payload: GmailPartSchema.optional(),
});

export interface ProjectEmail {
  messageId: string;
  project: string;
  subject: string;
  content: string;
  receivedAt: Date;
}

export async function authorizeGmail(
  clientId: string,
  expectedEmail: string,
): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const google = await waitForGoogleIdentity();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      hint: expectedEmail,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                "Google authorization was not completed.",
            ),
          );
          return;
        }
        const lifetimeSeconds = Number(response.expires_in ?? 3600);
        cachedToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + lifetimeSeconds * 1000,
        };
        resolve(response.access_token);
      },
      error_callback: () =>
        reject(new Error("Google authorization was closed or blocked.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export function clearCachedGmailToken(): void {
  cachedToken = null;
}

export async function disconnectGmail(): Promise<void> {
  const accessToken = cachedToken?.accessToken;
  cachedToken = null;
  if (!accessToken || !window.google) return;
  await new Promise<void>((resolve) => {
    window.google?.accounts.oauth2.revoke(accessToken, resolve);
  });
}

export async function confirmGmailAccount(
  accessToken: string,
  expectedEmail: string,
): Promise<void> {
  const profile = await gmailFetch(
    `${GMAIL_API}/profile`,
    accessToken,
    ProfileSchema,
  );
  if (
    profile.emailAddress.toLocaleLowerCase() !==
    expectedEmail.toLocaleLowerCase()
  ) {
    clearCachedGmailToken();
    window.google?.accounts.oauth2.revoke(accessToken);
    throw new Error(`Please authorize the ${expectedEmail} Gmail account.`);
  }
}

export async function findUnreadProjectEmails(
  accessToken: string,
  projects: string[],
  onProgress?: (message: string) => void,
): Promise<ProjectEmail[]> {
  if (projects.length === 0) return [];
  const queryProjects = projects
    .map((project) => project.replace(/["{}]/g, " ").trim())
    .filter(Boolean)
    .map((project) => `subject:"${project}"`)
    .join(" ");
  const query = `is:unread category:primary {${queryProjects}}`;
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("maxResults", "500");
    url.searchParams.set("q", query);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await gmailFetch(
      url.toString(),
      accessToken,
      MessageListSchema,
    );
    messageIds.push(...(page.messages ?? []).map((message) => message.id));
    pageToken = page.nextPageToken;
  } while (pageToken);

  const emails: ProjectEmail[] = [];
  for (let index = 0; index < messageIds.length; index += 1) {
    onProgress?.(
      `Reading matching email ${index + 1} of ${messageIds.length}…`,
    );
    const id = messageIds[index];
    if (!id) continue;
    const message = await gmailFetch(
      `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`,
      accessToken,
      GmailMessageSchema,
    );
    const subject = headerValue(message.payload, "Subject");
    const project = [...projects]
      .sort((left, right) => right.length - left.length)
      .find((name) =>
        subject.toLocaleLowerCase().includes(name.toLocaleLowerCase()),
      );
    if (!project) continue;
    const content = extractMessageText(message.payload);
    if (!content) continue;
    emails.push({
      messageId: message.id,
      project,
      subject,
      content,
      receivedAt: new Date(Number(message.internalDate ?? Date.now())),
    });
  }

  return emails.sort(
    (left, right) => left.receivedAt.getTime() - right.receivedAt.getTime(),
  );
}

export async function markEmailRead(
  accessToken: string,
  messageId: string,
): Promise<void> {
  const response = await fetch(
    `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    },
  );
  if (response.status === 401) clearCachedGmailToken();
  if (!response.ok)
    throw new Error(
      `Gmail could not mark a processed email as read (${response.status}).`,
    );
}

async function gmailFetch<T>(
  url: string,
  accessToken: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401) clearCachedGmailToken();
    throw new Error(
      response.status === 401
        ? "Google authorization expired. Select Process Gmail again."
        : `Gmail request failed (${response.status}).`,
    );
  }
  return schema.parse(await response.json());
}

function headerValue(payload: GmailPart | undefined, name: string): string {
  return (
    payload?.headers?.find(
      (header) => header.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )?.value ?? ""
  );
}

function extractMessageText(payload: GmailPart | undefined): string {
  if (!payload) return "";
  const plainParts: string[] = [];
  const htmlParts: string[] = [];
  collectParts(payload, plainParts, htmlParts);
  const plainText = plainParts.join("\n").trim();
  const text = plainText || htmlToText(htmlParts.join("\n"));
  return removeQuotedReplies(text).slice(0, 16_000);
}

function collectParts(part: GmailPart, plain: string[], html: string[]): void {
  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (part.mimeType === "text/plain") plain.push(decoded);
    if (part.mimeType === "text/html") html.push(decoded);
  }
  part.parts?.forEach((child) => collectParts(child, plain, html));
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function htmlToText(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document
    .querySelectorAll("script, style, template")
    .forEach((element) => element.remove());
  return document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function removeQuotedReplies(text: string): string {
  const marker =
    /\n(?:On .+ wrote:|From:\s|_{5,}|-{5,}\s*Original Message\s*-{5,})/i;
  return text.replace(/\r/g, "").split(marker)[0]?.trim() ?? "";
}

async function waitForGoogleIdentity(): Promise<NonNullable<Window["google"]>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (window.google) return window.google;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw new Error("Google Identity Services could not be loaded.");
}
