export type ChatContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "ordered-list"; start: number; items: string[] }
  | { type: "unordered-list"; items: string[] };

const orderedItemPattern = /^\s*(\d+)[.)]\s+(.+)$/;
const unorderedItemPattern = /^\s*[-*\u2022]\s+(.+)$/;

export function parseChatContent(content: string): ChatContentBlock[] {
  const blocks: ChatContentBlock[] = [];

  for (const rawLine of content.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const orderedItem = line.match(orderedItemPattern);
    if (orderedItem) {
      const number = Number(orderedItem[1]);
      const previous = blocks.at(-1);
      if (
        previous?.type === "ordered-list" &&
        number === previous.start + previous.items.length
      ) {
        previous.items.push(orderedItem[2]);
      } else {
        blocks.push({
          type: "ordered-list",
          start: number,
          items: [orderedItem[2]],
        });
      }
      continue;
    }

    const unorderedItem = line.match(unorderedItemPattern);
    if (unorderedItem) {
      const previous = blocks.at(-1);
      if (previous?.type === "unordered-list") {
        previous.items.push(unorderedItem[1]);
      } else {
        blocks.push({ type: "unordered-list", items: [unorderedItem[1]] });
      }
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
  }

  return blocks;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

export function chatContentToHtml(content: string): string {
  return parseChatContent(content)
    .map((block) => {
      if (block.type === "paragraph") {
        return `<p>${escapeHtml(block.text)}</p>`;
      }
      const items = block.items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");
      if (block.type === "ordered-list") {
        const start = block.start === 1 ? "" : ` start="${block.start}"`;
        return `<ol${start}>${items}</ol>`;
      }
      return `<ul>${items}</ul>`;
    })
    .join("");
}

export async function copyChatContent(content: string): Promise<void> {
  const plainText = content.replace(/\r\n?/g, "\n").trim();
  const ClipboardItemConstructor = globalThis.ClipboardItem;

  if (navigator.clipboard.write && ClipboardItemConstructor) {
    try {
      await navigator.clipboard.write([
        new ClipboardItemConstructor({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([chatContentToHtml(plainText)], {
            type: "text/html",
          }),
        }),
      ]);
      return;
    } catch {
      // Some browsers permit plain text but reject rich clipboard content.
    }
  }

  await navigator.clipboard.writeText(plainText);
}
