import type { NormalizedSenderRule } from "./types.ts";

type LegacyRule =
  | {
      domain?: string;
      email?: string;
      rule?: "always_trust" | "always_ignore";
    }
  | {
      pattern?: string;
      match_type?: "domain" | "email";
      action?: "always_trust" | "always_ignore";
    };

export function normalizeSenderRules(raw: unknown): NormalizedSenderRule[] {
  if (!Array.isArray(raw)) return [];

  const normalized: NormalizedSenderRule[] = [];

  for (const item of raw as LegacyRule[]) {
    if (!item || typeof item !== "object") continue;

    if ("pattern" in item && typeof item.pattern === "string" && typeof item.action === "string") {
      normalized.push({
        pattern: item.pattern.trim().toLowerCase(),
        matchType: item.match_type === "email" ? "email" : "domain",
        action: item.action,
      });
      continue;
    }

    if ("domain" in item && typeof item.domain === "string" && typeof item.rule === "string") {
      normalized.push({
        pattern: item.domain.trim().toLowerCase(),
        matchType: "domain",
        action: item.rule,
      });
      continue;
    }

    if ("email" in item && typeof item.email === "string" && typeof item.rule === "string") {
      normalized.push({
        pattern: item.email.trim().toLowerCase(),
        matchType: "email",
        action: item.rule,
      });
    }
  }

  return normalized.filter((rule) => rule.pattern.length > 0);
}

export function serializeDomainSenderRules(
  rules: Array<{ pattern: string; action: "always_trust" | "always_ignore" }>
): Array<{ pattern: string; match_type: "domain"; action: "always_trust" | "always_ignore" }> {
  return rules.map((rule) => ({
    pattern: rule.pattern.trim().toLowerCase(),
    match_type: "domain" as const,
    action: rule.action,
  }));
}
