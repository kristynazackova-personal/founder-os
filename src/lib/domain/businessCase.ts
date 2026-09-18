/**
 * The raw material for prefilling stage 1: a founder's website, or a business
 * case document they upload.
 *
 * Stage 1 of the build framework asks what the product does, what the user
 * gets, what the FOUNDER wants out of it and where they want to be in six
 * months. Those are facts about a business that already exists in their head
 * and usually on their landing page - which is why prefilling them does not
 * break the framework's first rule. That rule protects the IDEAS: the
 * segments, the pains, the solutions. It was never meant to make a founder
 * retype their own homepage.
 *
 * Pure. No DB, no env, no network.
 */

export type SourceKind = "pdf" | "docx" | "text";

/** Big enough for a real deck or a long doc, small enough to parse in a request. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * What reaches the model. A long document is not more useful than a short one
 * here - stage 1 is four sentences - and an unbounded upload would blow the
 * context and the bill alike.
 */
export const MAX_CONTEXT_CHARS = 40_000;

/** Below this there is nothing to read, and a confident answer would be invented. */
export const MIN_USEFUL_CHARS = 40;

const BY_EXTENSION: Record<string, SourceKind> = {
  pdf: "pdf",
  docx: "docx",
  txt: "text",
  md: "text",
  markdown: "text",
};

const BY_MIME: Record<string, SourceKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "text",
  "text/markdown": "text",
};

/**
 * Which parser to use. The extension decides, with the media type as a
 * fallback: browsers disagree about the type of a .md file, and some send
 * nothing at all, but the name is always there.
 */
export function kindForUpload(fileName: string, mimeType?: string): SourceKind | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (BY_EXTENSION[ext]) return BY_EXTENSION[ext];
  if (!mimeType) return null;
  return BY_MIME[mimeType.split(";")[0].trim().toLowerCase()] ?? null;
}

export const ACCEPTED_UPLOAD_ATTR = ".pdf,.docx,.txt,.md";
export const ACCEPTED_UPLOAD_LABEL = "PDF, Word (.docx), or plain text";

const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]", "g");

/**
 * Whitespace and control characters, flattened. PDF extraction in particular
 * produces ragged spacing that costs tokens and tells the model nothing.
 */
export function normalizeExtractedText(raw: string): string {
  const cleaned = raw
    .replace(CONTROL_CHARS, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.length > MAX_CONTEXT_CHARS
    ? `${cleaned.slice(0, MAX_CONTEXT_CHARS).trimEnd()}\n\n[truncated]`
    : cleaned;
}

/** Enough text to reason from, rather than a cookie banner. */
export const hasUsefulText = (text: string): boolean => text.trim().length >= MIN_USEFUL_CHARS;

/**
 * A page's visible words. Deliberately crude: script and style go first,
 * then every tag, then the handful of entities that survive in real copy.
 * A DOM parser would be more faithful and would also be a dependency and an
 * attack surface for something whose output is four sentences.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'");
  return normalizeExtractedText(text);
}

/** How the prefill describes its own evidence, so the founder can judge it. */
export function sourceSummary(parts: { website?: string | null; document?: string | null }): string {
  const bits: string[] = [];
  if (parts.website) bits.push("your website");
  if (parts.document) bits.push("the document you uploaded");
  return bits.length === 0 ? "nothing yet" : bits.join(" and ");
}
