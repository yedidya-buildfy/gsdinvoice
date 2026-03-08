import { extractTextBody, getHeader, getSenderDomain, getSenderEmail } from "./message.ts";
import type {
  EmailCandidate,
  EmailDetectionResult,
  EmailMessageLike,
  NormalizedSenderRule,
  RuleScoreResult,
} from "./types.ts";

const KNOWN_VENDOR_DOMAINS = new Set([
  "paypal.com",
  "stripe.com",
  "shopify.com",
  "amazon.com",
  "google.com",
  "apple.com",
  "microsoft.com",
  "wix.com",
  "github.com",
  "atlassian.com",
  "zoom.us",
  "slack.com",
  "notion.so",
  "vercel.com",
  "cloudflare.com",
  "facebookmail.com",
  "meta.com",
  "isracard.co.il",
  "leumi.co.il",
  "poalim.co.il",
  "discount.co.il",
  "mizrahi-tefahot.co.il",
  "cal-online.co.il",
  "max.co.il",
  "bezeq.co.il",
  "partner.co.il",
  "cellcom.co.il",
  "hot.net.il",
  "yes.co.il",
]);

const BILLING_PREFIXES = new Set([
  "billing",
  "receipts",
  "receipt",
  "invoice",
  "invoices",
  "payments",
  "payment",
  "orders",
  "order",
  "accounting",
  "accounts",
  "finance",
  "statement",
  "statements",
  "noreply",
  "no-reply",
  "no_reply",
]);

const POSITIVE_SUBJECT_PATTERN =
  /\b(receipt|invoice|billing|bill|payment|charge|transaction|statement|order confirmation|tax invoice)\b|חשבונית|קבלה|אישור תשלום|חשבונית מס/i;

const POSITIVE_BODY_PATTERN =
  /\b(total|subtotal|tax|vat|amount|invoice|receipt|order|transaction|charge)\b|חשבונית|קבלה|מע"מ|סך הכל/i;

const STRONG_NEGATIVE_PATTERN =
  /\b(password reset|verify your email|security alert|welcome to|newsletter|unsubscribe|tracking number|out for delivery|shipped|delivered|flash sale|limited time)\b/i;

function extractJsonObject(text: string): string | null {
  const startIndex = text.indexOf("{");
  if (startIndex < 0) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = startIndex; index < text.length; index++) {
    const char = text[index];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\" && inString) {
      escapeNext = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

export function scoreEmailSignals(
  message: EmailMessageLike,
  senderRules: NormalizedSenderRule[],
  candidates: EmailCandidate[],
): RuleScoreResult {
  const senderEmail = getSenderEmail(message);
  const senderDomain = getSenderDomain(message);
  const senderPrefix = senderEmail.split("@")[0] || "";
  const subject = getHeader(message, "Subject") || "";
  const body = extractTextBody(message.payload);
  const reasons: string[] = [];
  let score = 0;

  for (const rule of senderRules) {
    const matches = rule.matchType === "email"
      ? senderEmail === rule.pattern
      : senderDomain === rule.pattern || senderDomain.endsWith(`.${rule.pattern}`);

    if (!matches) continue;

    if (rule.action === "always_ignore") {
      return { score: 0, reasons: ["sender_rule_ignore"], hardDecision: "no" };
    }

    return { score: 100, reasons: ["sender_rule_trust"], hardDecision: "yes" };
  }

  if (STRONG_NEGATIVE_PATTERN.test(subject) && candidates.length === 0) {
    return { score: 0, reasons: ["strong_negative_subject"], hardDecision: "no" };
  }

  if (BILLING_PREFIXES.has(senderPrefix)) {
    score += 15;
    reasons.push("billing_sender_prefix");
  }

  if (KNOWN_VENDOR_DOMAINS.has(senderDomain)) {
    score += 15;
    reasons.push("known_vendor_domain");
  }

  if (POSITIVE_SUBJECT_PATTERN.test(subject)) {
    score += 20;
    reasons.push("financial_subject");
  }

  if (POSITIVE_BODY_PATTERN.test(body)) {
    score += 15;
    reasons.push("financial_body");
  }

  const attachmentCount = candidates.filter((candidate) => candidate.kind === "attachment").length;
  const hasHtml = candidates.some((candidate) => candidate.kind === "html_body");
  const linkCount = candidates.filter((candidate) => candidate.kind === "download_link").length;

  if (attachmentCount > 0) {
    score += 25;
    reasons.push("supported_attachment");
  }

  if (hasHtml) {
    score += 10;
    reasons.push("html_candidate");
  }

  if (linkCount > 0) {
    score += 10;
    reasons.push("download_link_candidate");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}

export async function detectFinancialEmail(
  apiKey: string | undefined,
  message: EmailMessageLike,
  candidates: EmailCandidate[],
  senderRules: NormalizedSenderRule[],
  geminiUrl: string,
): Promise<EmailDetectionResult> {
  const ruleResult = scoreEmailSignals(message, senderRules, candidates);
  if (ruleResult.hardDecision === "yes") {
    return { label: "yes", confidence: 100, reason: ruleResult.reasons[0] || "sender_rule_trust" };
  }
  if (ruleResult.hardDecision === "no") {
    return { label: "no", confidence: 100, reason: ruleResult.reasons[0] || "sender_rule_ignore" };
  }

  if (!apiKey) {
    if (ruleResult.score >= 35) {
      return { label: "yes", confidence: ruleResult.score, reason: ruleResult.reasons[0] || "rule_score" };
    }
    return { label: "no", confidence: Math.max(0, 100 - ruleResult.score), reason: "rule_score_fallback" };
  }

  const sender = getSenderEmail(message);
  const subject = getHeader(message, "Subject") || "";
  const body = extractTextBody(message.payload).slice(0, 2500);
  const candidateSummary = candidates.map((candidate) => {
    if (candidate.kind === "attachment") {
      return `attachment:${candidate.filename}:${candidate.mimeType}`;
    }
    if (candidate.kind === "html_body") {
      return `html:${candidate.filename}`;
    }
    return `link:${candidate.url}`;
  }).join("\n");

  const prompt = `Classify whether this email likely contains a financial document that should enter invoice/receipt extraction.

Return JSON only:
{
  "label": "yes" | "maybe" | "no",
  "confidence": 0-100,
  "reason": "short_reason"
}

Sender: ${sender}
Subject: ${subject}
Body:
${body}

Candidates:
${candidateSummary}

Heuristic score: ${ruleResult.score}
Heuristic reasons: ${ruleResult.reasons.join(", ") || "none"}`;

  try {
    const response = await fetch(`${geminiUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 256,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini classify failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini classify returned no content");
    }

    const json = extractJsonObject(text);
    if (!json) {
      throw new Error("Gemini classify returned no JSON");
    }

    const parsed = JSON.parse(json) as Partial<EmailDetectionResult>;
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
      : ruleResult.score;

    const label = parsed.label === "yes" || parsed.label === "maybe" || parsed.label === "no"
      ? parsed.label
      : (ruleResult.score >= 35 ? "yes" : "no");

    return {
      label,
      confidence,
      reason: typeof parsed.reason === "string" ? parsed.reason : "gemini_flash_lite",
    };
  } catch (error) {
    console.error("[EMAIL-DETECT] Falling back to heuristic detection:", error);
    if (ruleResult.score >= 35) {
      return { label: "yes", confidence: ruleResult.score, reason: "heuristic_fallback_yes" };
    }
    return { label: "no", confidence: Math.max(0, 100 - ruleResult.score), reason: "heuristic_fallback_no" };
  }
}
