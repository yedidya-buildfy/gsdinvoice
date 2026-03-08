import {
  collectSupportedAttachments,
  extractHtmlBody,
  extractLinksFromHtml,
  getSenderDomain,
  htmlToPlainText,
  inferMimeTypeFromFilename,
  sanitizeFilename,
} from "./message.ts";
import type { DownloadLinkCandidate, EmailCandidate, EmailMessageLike } from "./types.ts";

const FINANCIAL_HINT_PATTERN =
  /\b(receipt|invoice|billing|bill|payment|tax invoice|order confirmation|transaction|charge|subtotal|total|vat)\b|חשבונית|קבלה|אישור תשלום|חשבונית מס/i;

const LINK_HINT_PATTERN =
  /\b(receipt|invoice|billing|bill|download|tax|statement)\b|חשבונית|קבלה/i;

function sameDomainOrSubdomain(url: URL, senderDomain: string): boolean {
  const hostname = url.hostname.toLowerCase();
  const normalizedSenderDomain = senderDomain.toLowerCase();
  return hostname === normalizedSenderDomain || hostname.endsWith(`.${normalizedSenderDomain}`);
}

function buildLinkCandidate(urlString: string, text: string, senderDomain: string): DownloadLinkCandidate | null {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    return null;
  }

  const combinedHint = `${url.pathname} ${url.search} ${text}`;
  if (!LINK_HINT_PATTERN.test(combinedHint) && !sameDomainOrSubdomain(url, senderDomain)) {
    return null;
  }

  const rawFilename = url.pathname.split("/").pop() || "downloaded-invoice";
  const filename = sanitizeFilename(rawFilename || "downloaded-invoice");
  return {
    kind: "download_link",
    identityKey: `download_link:${url.toString()}`,
    filename,
    mimeType: inferMimeTypeFromFilename(filename),
    url: url.toString(),
    text,
  };
}

export function discoverDocumentCandidates(message: EmailMessageLike): EmailCandidate[] {
  const candidates: EmailCandidate[] = [];

  for (const attachment of collectSupportedAttachments(message.payload)) {
    candidates.push({
      kind: "attachment",
      identityKey: `attachment:${attachment.attachmentId}`,
      attachmentId: attachment.attachmentId,
      filename: sanitizeFilename(attachment.filename),
      mimeType: attachment.mimeType,
      size: attachment.size,
    });
  }

  const html = extractHtmlBody(message.payload);
  const plainFromHtml = html ? htmlToPlainText(html) : "";
  const senderDomain = getSenderDomain(message);

  if (html && FINANCIAL_HINT_PATTERN.test(`${html} ${plainFromHtml}`)) {
    candidates.push({
      kind: "html_body",
      identityKey: "html_body:primary",
      filename: `email_${message.id}_body.html`,
      mimeType: "text/html",
    });
  }

  if (html) {
    for (const link of extractLinksFromHtml(html)) {
      const candidate = buildLinkCandidate(link.url, link.text, senderDomain);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  const deduped = new Map<string, EmailCandidate>();
  for (const candidate of candidates) {
    deduped.set(candidate.identityKey, candidate);
  }

  return [...deduped.values()];
}
