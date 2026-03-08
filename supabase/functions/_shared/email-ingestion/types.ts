export interface EmailHeaderLike {
  name: string;
  value: string;
}

export interface EmailPartLike {
  mimeType?: string;
  filename?: string;
  headers?: EmailHeaderLike[];
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string;
  };
  parts?: EmailPartLike[];
}

export interface EmailMessageLike {
  id: string;
  payload: EmailPartLike;
}

export interface AttachmentCandidate {
  kind: "attachment";
  identityKey: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface HtmlBodyCandidate {
  kind: "html_body";
  identityKey: string;
  filename: string;
  mimeType: "text/html";
}

export interface DownloadLinkCandidate {
  kind: "download_link";
  identityKey: string;
  filename: string;
  mimeType: string | null;
  url: string;
  text: string;
}

export type EmailCandidate =
  | AttachmentCandidate
  | HtmlBodyCandidate
  | DownloadLinkCandidate;

export interface NormalizedSenderRule {
  pattern: string;
  matchType: "domain" | "email";
  action: "always_trust" | "always_ignore";
}

export interface RuleScoreResult {
  score: number;
  reasons: string[];
  hardDecision?: "yes" | "no";
}

export interface EmailDetectionResult {
  label: "yes" | "maybe" | "no";
  confidence: number;
  reason: string;
}
