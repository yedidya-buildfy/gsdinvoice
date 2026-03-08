import type {
  EmailHeaderLike,
  EmailMessageLike,
  EmailPartLike,
} from "./types.ts";

const SUPPORTED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const SUPPORTED_ATTACHMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

export function getHeader(
  source: EmailMessageLike | EmailPartLike,
  headerName: string,
): string | undefined {
  const headers = "payload" in source ? source.payload?.headers : source.headers;
  if (!headers) return undefined;

  const match = (headers as EmailHeaderLike[]).find(
    (header) => header.name.toLowerCase() === headerName.toLowerCase(),
  );
  return match?.value;
}

export function getSenderEmail(message: EmailMessageLike): string {
  const from = getHeader(message, "From") || "";
  const angleMatch = from.match(/<([^>]+)>/);
  return (angleMatch ? angleMatch[1] : from).trim().toLowerCase();
}

export function getSenderDomain(message: EmailMessageLike): string {
  const sender = getSenderEmail(message);
  const atIndex = sender.indexOf("@");
  return atIndex >= 0 ? sender.slice(atIndex + 1) : sender;
}

export function base64UrlDecode(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

export function base64UrlDecodeToBytes(data: string): Uint8Array {
  const decoded = base64UrlDecode(data);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

export function extractTextBody(part: EmailPartLike): string {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return base64UrlDecode(part.body.data);
  }

  if (part.parts) {
    for (const child of part.parts) {
      const text = extractTextBody(child);
      if (text) return text;
    }
  }

  return "";
}

export function extractHtmlBody(part: EmailPartLike): string {
  if (part.mimeType === "text/html" && part.body?.data) {
    return base64UrlDecode(part.body.data);
  }

  if (part.parts) {
    for (const child of part.parts) {
      const html = extractHtmlBody(child);
      if (html) return html;
    }
  }

  return "";
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function collectSupportedAttachments(part: EmailPartLike): Array<{
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}> {
  const attachments: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }> = [];

  const walk = (node: EmailPartLike): void => {
    const mimeType = (node.mimeType || "").toLowerCase();
    const filename = node.filename || "";
    const lowerFilename = filename.toLowerCase();
    const isSupportedMime = SUPPORTED_ATTACHMENT_MIME_TYPES.has(mimeType);
    const isSupportedExt = SUPPORTED_ATTACHMENT_EXTENSIONS.some((extension) =>
      lowerFilename.endsWith(extension)
    );

    if (filename && node.body?.attachmentId && (isSupportedMime || isSupportedExt)) {
      attachments.push({
        attachmentId: node.body.attachmentId,
        filename,
        mimeType: mimeType || inferMimeTypeFromFilename(filename) || "application/octet-stream",
        size: node.body.size || 0,
      });
    }

    if (node.parts) {
      for (const child of node.parts) {
        walk(child);
      }
    }
  };

  walk(part);
  return attachments;
}

export function extractLinksFromHtml(html: string): Array<{ url: string; text: string }> {
  const results: Array<{ url: string; text: string }> = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const url = match[1]?.trim();
    const text = htmlToPlainText(match[2] || "");

    if (!url) continue;
    results.push({ url, text });
  }

  return results.slice(0, 25);
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function inferMimeTypeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  return null;
}
