import { describe, expect, it } from 'vitest'

import { detectFinancialEmail, scoreEmailSignals } from '../detectFinancialEmail.ts'
import { discoverDocumentCandidates } from '../discoverCandidates.ts'
import { normalizeSenderRules } from '../senderRules.ts'
import type { EmailMessageLike } from '../types.ts'

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function buildMessage(overrides?: Partial<EmailMessageLike>): EmailMessageLike {
  return {
    id: 'msg_1',
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'From', value: 'Billing <billing@example.com>' },
        { name: 'Subject', value: 'Invoice for March' },
      ],
      parts: [
        {
          mimeType: 'text/plain',
          body: {
            size: 64,
            data: encodeBase64Url('Your invoice total is 123.45 USD'),
          },
        },
      ],
    },
    ...overrides,
  }
}

describe('normalizeSenderRules', () => {
  it('normalizes both legacy and canonical sender rule shapes', () => {
    const rules = normalizeSenderRules([
      { domain: 'paypal.com', rule: 'always_trust' },
      { email: 'billing@example.com', rule: 'always_ignore' },
      { pattern: 'vendor.com', match_type: 'domain', action: 'always_trust' },
    ])

    expect(rules).toEqual([
      { pattern: 'paypal.com', matchType: 'domain', action: 'always_trust' },
      { pattern: 'billing@example.com', matchType: 'email', action: 'always_ignore' },
      { pattern: 'vendor.com', matchType: 'domain', action: 'always_trust' },
    ])
  })
})

describe('discoverDocumentCandidates', () => {
  it('discovers multiple attachments, html bodies, and invoice links from one message', () => {
    const html = `
      <html>
        <body>
          <p>חשבונית מס 1001</p>
          <a href="https://vendor.example.com/download/invoice-1001.pdf">Download invoice</a>
        </body>
      </html>
    `

    const message = buildMessage({
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'Billing <billing@vendor.example.com>' },
          { name: 'Subject', value: 'Your invoice is ready' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              size: 64,
              data: encodeBase64Url('Invoice attached'),
            },
          },
          {
            mimeType: 'text/html',
            body: {
              size: html.length,
              data: encodeBase64Url(html),
            },
          },
          {
            mimeType: 'application/pdf',
            filename: 'invoice-1.pdf',
            body: { attachmentId: 'att_1', size: 100 },
          },
          {
            mimeType: 'application/pdf',
            filename: 'invoice-2.pdf',
            body: { attachmentId: 'att_2', size: 110 },
          },
        ],
      },
    })

    const candidates = discoverDocumentCandidates(message)

    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      'attachment',
      'attachment',
      'html_body',
      'download_link',
    ])
  })
})

describe('detectFinancialEmail', () => {
  it('accepts a message with strong financial signals when no model key is provided', async () => {
    const message = buildMessage({
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'Billing <billing@paypal.com>' },
          { name: 'Subject', value: 'Invoice #12345' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              size: 64,
              data: encodeBase64Url('Total 123.45 USD'),
            },
          },
          {
            mimeType: 'application/pdf',
            filename: 'invoice.pdf',
            body: { attachmentId: 'att_1', size: 100 },
          },
        ],
      },
    })

    const candidates = discoverDocumentCandidates(message)
    const detection = await detectFinancialEmail(undefined, message, candidates, [], 'https://example.com')

    expect(detection.label).toBe('yes')
    expect(detection.confidence).toBeGreaterThanOrEqual(35)
  })

  it('hard rejects ignored senders', async () => {
    const message = buildMessage({
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'Ads <promo@example.com>' },
          { name: 'Subject', value: 'Limited time sale' },
        ],
        parts: [],
      },
    })

    const rules = normalizeSenderRules([{ domain: 'example.com', rule: 'always_ignore' }])
    const score = scoreEmailSignals(message, rules, [])

    expect(score.hardDecision).toBe('no')
  })
})

// ---------------------------------------------------------------------------
// Fixture tests
// ---------------------------------------------------------------------------

describe('discoverDocumentCandidates', () => {
  it('finds two separate attachment candidates from a multi-attachment email', () => {
    const message: EmailMessageLike = {
      id: 'msg_multi_attach',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'accounts@vendor.com' },
          { name: 'Subject', value: 'Your documents' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { size: 20, data: encodeBase64Url('See attached files') },
          },
          {
            mimeType: 'application/pdf',
            filename: 'receipt-jan.pdf',
            body: { attachmentId: 'att_a', size: 2048 },
          },
          {
            mimeType: 'application/pdf',
            filename: 'receipt-feb.pdf',
            body: { attachmentId: 'att_b', size: 3072 },
          },
        ],
      },
    }

    const candidates = discoverDocumentCandidates(message)
    const attachments = candidates.filter((c) => c.kind === 'attachment')

    expect(attachments).toHaveLength(2)
    expect(attachments[0].identityKey).not.toBe(attachments[1].identityKey)
    expect(attachments[0].identityKey).toBe('attachment:att_a')
    expect(attachments[1].identityKey).toBe('attachment:att_b')
  })

  it('produces an html_body candidate from an HTML-only receipt with financial keywords', () => {
    const html = '<html><body><h1>Invoice</h1><p>Total amount: $150.00</p></body></html>'

    const message: EmailMessageLike = {
      id: 'msg_html_only',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'billing@store.com' },
          { name: 'Subject', value: 'Your receipt' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { size: 30, data: encodeBase64Url('Invoice total amount $150') },
          },
          {
            mimeType: 'text/html',
            body: { size: html.length, data: encodeBase64Url(html) },
          },
        ],
      },
    }

    const candidates = discoverDocumentCandidates(message)

    expect(candidates).toHaveLength(1)
    expect(candidates[0].kind).toBe('html_body')
    expect(candidates[0].identityKey).toBe('html_body:primary')
  })

  it('produces a download_link candidate from an email with an invoice download URL', () => {
    const html = `
      <html><body>
        <p>Your invoice is ready</p>
        <a href="https://vendor.com/invoice/download/123.pdf">Download Invoice</a>
      </body></html>
    `

    const message: EmailMessageLike = {
      id: 'msg_download_link',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'billing@vendor.com' },
          { name: 'Subject', value: 'Invoice ready' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { size: 20, data: encodeBase64Url('Your invoice is ready') },
          },
          {
            mimeType: 'text/html',
            body: { size: html.length, data: encodeBase64Url(html) },
          },
        ],
      },
    }

    const candidates = discoverDocumentCandidates(message)
    const downloadLinks = candidates.filter((c) => c.kind === 'download_link')

    expect(downloadLinks).toHaveLength(1)
    expect(downloadLinks[0].kind).toBe('download_link')
    expect((downloadLinks[0] as { url: string }).url).toBe(
      'https://vendor.com/invoice/download/123.pdf'
    )
  })

  it('produces 0 candidates from a password reset email with no financial content', () => {
    const message: EmailMessageLike = {
      id: 'msg_password_reset',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'noreply@app.myservice.com' },
          { name: 'Subject', value: 'Reset your password' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { size: 40, data: encodeBase64Url('Click the link to reset your password.') },
          },
        ],
      },
    }

    const candidates = discoverDocumentCandidates(message)

    expect(candidates).toHaveLength(0)
  })

  it('deduplicates candidates that share the same identity key', () => {
    const html = `
      <html><body>
        <p>חשבונית מס</p>
        <a href="https://vendor.com/invoice/download/same.pdf">Download</a>
        <a href="https://vendor.com/invoice/download/same.pdf">Download again</a>
      </body></html>
    `

    const message: EmailMessageLike = {
      id: 'msg_dedup',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'billing@vendor.com' },
          { name: 'Subject', value: 'Invoice' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { size: 10, data: encodeBase64Url('Invoice') },
          },
          {
            mimeType: 'text/html',
            body: { size: html.length, data: encodeBase64Url(html) },
          },
        ],
      },
    }

    const candidates = discoverDocumentCandidates(message)
    const downloadLinks = candidates.filter((c) => c.kind === 'download_link')

    // The same URL should appear only once after deduplication
    expect(downloadLinks).toHaveLength(1)

    // All identity keys should be unique
    const keys = candidates.map((c) => c.identityKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('produces 3 candidates of different kinds from a mixed email', () => {
    const html = `
      <html><body>
        <p>Invoice total: $250.00</p>
        <a href="https://vendor.com/receipt/download/456.pdf">Download receipt</a>
      </body></html>
    `

    const message: EmailMessageLike = {
      id: 'msg_mixed',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'billing@vendor.com' },
          { name: 'Subject', value: 'Your invoice and receipt' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { size: 30, data: encodeBase64Url('Invoice total: $250.00') },
          },
          {
            mimeType: 'text/html',
            body: { size: html.length, data: encodeBase64Url(html) },
          },
          {
            mimeType: 'application/pdf',
            filename: 'invoice-main.pdf',
            body: { attachmentId: 'att_main', size: 5000 },
          },
        ],
      },
    }

    const candidates = discoverDocumentCandidates(message)
    const kinds = candidates.map((c) => c.kind)

    expect(kinds).toContain('attachment')
    expect(kinds).toContain('html_body')
    expect(kinds).toContain('download_link')
    expect(candidates).toHaveLength(3)
  })
})

describe('scoreEmailSignals', () => {
  it('gives a low score to a newsletter with marketing subject and List-Unsubscribe header', () => {
    const message: EmailMessageLike = {
      id: 'msg_newsletter',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'marketing@shop.com' },
          { name: 'Subject', value: 'Flash Sale! 50% off everything' },
          { name: 'List-Unsubscribe', value: '<mailto:unsub@shop.com>' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { size: 30, data: encodeBase64Url('Check out our latest deals!') },
          },
          {
            mimeType: 'application/pdf',
            filename: 'brochure.pdf',
            body: { attachmentId: 'att_brochure', size: 8192 },
          },
        ],
      },
    }

    const candidates = discoverDocumentCandidates(message)
    const result = scoreEmailSignals(message, [], candidates)

    // "Flash Sale" matches STRONG_NEGATIVE_PATTERN but candidates.length > 0,
    // so it won't hard-reject. However, it should still score low because
    // there are no financial subject/body signals and no billing prefix/known domain.
    // Only the attachment candidate contributes (+25).
    expect(result.score).toBeLessThanOrEqual(30)
    expect(result.hardDecision).toBeUndefined()
  })

  it('returns hardDecision "yes" with score 100 for always_trust sender rule', () => {
    const message: EmailMessageLike = {
      id: 'msg_trusted',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'random@trusted-vendor.com' },
          { name: 'Subject', value: 'Hello' },
        ],
        parts: [],
      },
    }

    const rules = normalizeSenderRules([
      { domain: 'trusted-vendor.com', rule: 'always_trust' },
    ])
    const result = scoreEmailSignals(message, rules, [])

    expect(result.hardDecision).toBe('yes')
    expect(result.score).toBe(100)
    expect(result.reasons).toContain('sender_rule_trust')
  })

  it('returns hardDecision "no" with score 0 for always_ignore sender rule', () => {
    const message: EmailMessageLike = {
      id: 'msg_ignored',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'billing@ignored-domain.com' },
          { name: 'Subject', value: 'Your Invoice #999' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: { size: 20, data: encodeBase64Url('Total: $500') },
          },
        ],
      },
    }

    const rules = normalizeSenderRules([
      { domain: 'ignored-domain.com', rule: 'always_ignore' },
    ])
    const candidates = discoverDocumentCandidates(message)
    const result = scoreEmailSignals(message, rules, candidates)

    expect(result.hardDecision).toBe('no')
    expect(result.score).toBe(0)
    expect(result.reasons).toContain('sender_rule_ignore')
  })

  it('scores high for a Hebrew receipt email with financial keywords', () => {
    const message: EmailMessageLike = {
      id: 'msg_hebrew',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'billing@israelivendor.co.il' },
          { name: 'Subject', value: 'חשבונית מס מספר 5678' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              size: 60,
              data: encodeBase64Url('סך הכל לתשלום: 350.00 ש"ח כולל מע"מ'),
            },
          },
          {
            mimeType: 'application/pdf',
            filename: 'hashbonit.pdf',
            body: { attachmentId: 'att_heb', size: 4096 },
          },
        ],
      },
    }

    const candidates = discoverDocumentCandidates(message)
    const result = scoreEmailSignals(message, [], candidates)

    // billing prefix (+15), financial subject with חשבונית מס (+20), attachment (+25) = 60
    // Note: body Hebrew matching depends on base64 UTF-8 decode fidelity
    expect(result.score).toBeGreaterThanOrEqual(55)
    expect(result.reasons).toContain('financial_subject')
    expect(result.reasons).toContain('supported_attachment')
    expect(result.reasons).toContain('billing_sender_prefix')
  })

  it('hard rejects a password reset email with no candidates', () => {
    const message: EmailMessageLike = {
      id: 'msg_pw_reset_score',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'noreply@service.com' },
          { name: 'Subject', value: 'Password reset request for your account' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              size: 50,
              data: encodeBase64Url('Click to reset your password. This link expires in 24h.'),
            },
          },
        ],
      },
    }

    const result = scoreEmailSignals(message, [], [])

    // "password reset" in STRONG_NEGATIVE_PATTERN + 0 candidates => hard "no"
    expect(result.hardDecision).toBe('no')
    expect(result.score).toBe(0)
    expect(result.reasons).toContain('strong_negative_subject')
  })
})

describe('normalizeSenderRules', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeSenderRules(null)).toEqual([])
    expect(normalizeSenderRules(undefined)).toEqual([])
    expect(normalizeSenderRules('string')).toEqual([])
    expect(normalizeSenderRules(42)).toEqual([])
  })

  it('skips malformed entries without crashing', () => {
    const rules = normalizeSenderRules([
      null,
      undefined,
      {},
      { domain: '' },
      { domain: 'valid.com', rule: 'always_trust' },
    ])

    expect(rules).toHaveLength(1)
    expect(rules[0].pattern).toBe('valid.com')
  })

  it('lowercases and trims patterns', () => {
    const rules = normalizeSenderRules([
      { domain: '  PayPal.COM  ', rule: 'always_trust' },
    ])

    expect(rules[0].pattern).toBe('paypal.com')
  })
})
