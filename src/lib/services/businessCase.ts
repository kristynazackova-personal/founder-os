/**
 * Turning a founder's website or uploaded business case into plain text.
 *
 * Every function here fails soft and returns a reason rather than throwing:
 * a site that is down, a PDF that is a scan, a Word file that is really a
 * renamed zip - none of those should break the page the founder is standing
 * on. The prefill simply has less to go on and says so.
 *
 * The parsing itself lives behind dynamic imports so the PDF and Word
 * libraries are only loaded when someone actually uploads one of those.
 */
import {
  MAX_UPLOAD_BYTES,
  hasUsefulText,
  htmlToText,
  kindForUpload,
  normalizeExtractedText,
  type SourceKind,
} from "../domain/businessCase";

export type Extracted = { text: string | null; error: string | null };

const FETCH_TIMEOUT_MS = 12_000;

/**
 * A URL we are willing to fetch on the founder's behalf.
 *
 * The URL comes from their own app record, but it is still a value we send a
 * server-side request to, so it is checked rather than trusted: https only,
 * a real hostname, and nothing pointed at our own network. Blocking obvious
 * private space is not a complete SSRF defence (DNS can still resolve a
 * public name inward) and is not claimed to be; it is the cheap half.
 */
function safeUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.startsWith("[")
  ) {
    return null;
  }
  return url;
}

/** The visible words on a founder's landing page. */
export async function fetchWebsiteText(raw: string | null | undefined): Promise<Extracted> {
  if (!raw) return { text: null, error: "No website on record for this business." };
  const url = safeUrl(raw);
  if (!url) return { text: null, error: "That does not look like a public website address." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "FounderOS/1.0 (+business case prefill)" },
    });
    if (!res.ok) return { text: null, error: `The site answered ${res.status}.` };
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(type)) return { text: null, error: `The site returned ${type || "an unreadable type"}.` };
    const body = await res.text();
    const text = htmlToText(body);
    if (!hasUsefulText(text)) return { text: null, error: "The page had almost no readable text, so it was probably rendered by JavaScript." };
    return { text, error: null };
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError" ? "The site took too long to answer." : "The site could not be reached.";
    return { text: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function readPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await task.destroy();
  return pages.join("\n\n");
}

async function readDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}

/** Plain text from an uploaded business case. */
export async function extractUploadText(file: File): Promise<Extracted> {
  if (file.size === 0) return { text: null, error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { text: null, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }
  const kind: SourceKind | null = kindForUpload(file.name, file.type);
  if (!kind) return { text: null, error: "That file type is not supported. Use a PDF, a Word .docx, or plain text." };

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const raw = kind === "pdf" ? await readPdf(bytes) : kind === "docx" ? await readDocx(bytes) : new TextDecoder().decode(bytes);
    const text = normalizeExtractedText(raw);
    if (!hasUsefulText(text)) {
      // The common cause by far is a PDF of scanned pages: it has no text
      // layer at all, and no amount of retrying will give it one.
      return {
        text: null,
        error:
          kind === "pdf"
            ? "No text could be read from that PDF. If it is a scan, it has no text layer - paste the text instead."
            : "That file had almost no readable text.",
      };
    }
    return { text, error: null };
  } catch (err) {
    // The founder gets a plain sentence; the cause goes to the logs, because
    // "could not be read" is indistinguishable from a bundling mistake.
    console.error("[businessCase] parse failed:", kind, err instanceof Error ? err.message : err);
    return { text: null, error: `That file could not be read as ${kind === "docx" ? "a Word document" : kind}.` };
  }
}
