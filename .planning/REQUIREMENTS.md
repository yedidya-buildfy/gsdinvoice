# Requirements: VAT Declaration Manager

**Defined:** 2026-01-27
**Core Value:** Automatically connect invoices and receipts to bank/credit card transactions, eliminating manual matching for VAT reporting.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can sign up with email/password via Supabase
- [ ] **AUTH-02**: User can log in and stay logged in across sessions
- [ ] **AUTH-03**: User can log out from any page

### Document Upload

- [ ] **UPLD-01**: User can upload multiple files at once (batch upload)
- [ ] **UPLD-02**: User can upload PDF, images (jpg/png), xlsx, csv files
- [ ] **UPLD-03**: User can view uploaded documents in a list with thumbnails

### AI Extraction

- [ ] **EXTR-01**: System extracts invoice data via Gemini 3 Flash (vendor, date, amount, VAT, invoice#)
- [ ] **EXTR-02**: System provides confidence score (0-100%) for each extraction
- [ ] **EXTR-03**: User can set auto-approval threshold in settings (default 80%)
- [ ] **EXTR-04**: Low-confidence extractions require manual review
- [ ] **EXTR-05**: User can edit all extracted fields manually

### Bank & Credit Card Import

- [ ] **BANK-01**: User can upload bank statement (xlsx/csv)
- [ ] **BANK-02**: System parses Israeli bank formats (date, description, amount, reference)
- [ ] **BANK-03**: User can upload credit card statement (xlsx/csv)
- [ ] **BANK-04**: User can view transactions in sortable/filterable list
- [ ] **BANK-05**: System detects credit card charges in bank movements (e.g., "ישראכרט")
- [ ] **BANK-06**: System links credit card bank rows to credit card detail rows

### Matching Engine

- [ ] **MTCH-01**: AI auto-matches invoices to transactions with confidence scoring
- [ ] **MTCH-02**: User can manually match invoices to transactions
- [ ] **MTCH-03**: User can split-match one invoice to multiple expense rows (amount allocation)
- [ ] **MTCH-04**: User can group-match multiple invoices to one expense row
- [ ] **MTCH-05**: System validates that allocated amounts balance correctly

### Duplicate Detection

- [ ] **DUPL-01**: System detects fuzzy duplicates (near-matches, typos, slight variations)
- [ ] **DUPL-02**: User sees existing vs new data side-by-side
- [ ] **DUPL-03**: User can select rows and batch-apply action (skip/replace/add anyway)

### Dashboard & Reporting

- [ ] **DASH-01**: Dashboard shows count of expense rows without linked invoices
- [ ] **DASH-02**: Dashboard shows count of invoices without linked expense rows
- [ ] **DASH-03**: User can select date range for reports
- [ ] **DASH-04**: User can export data to CSV/Excel

### Navigation & Settings

- [ ] **NAV-01**: Sidebar with pages: Dashboard, Bank Movements, Invoices & Receipts, Credit Card, Settings
- [ ] **SETT-01**: User can configure matching trigger (after uploads / on invoice upload / manual)
- [ ] **SETT-02**: User can configure auto-approval confidence threshold

### Design

- [ ] **UI-01**: Dark theme with green accent color
- [ ] **UI-02**: Untitled UI components (slim sidebar, date picker, file uploader, tables)
- [ ] **UI-03**: Hebrew/RTL support for document content

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Team Features

- **TEAM-01**: Multiple users can access same company data
- **TEAM-02**: User roles (admin, member)

### Advanced Features

- **ADV-01**: Smart expense categorization (auto-tag)
- **ADV-02**: VAT calculation with Israeli 18% rate
- **ADV-03**: VAT liability projections
- **ADV-04**: Allocation number (mispar haktzaa) validation
- **ADV-05**: Mobile PWA with camera capture

### Integrations

- **INT-01**: Accountant portal (multi-client view)
- **INT-02**: WhatsApp invoice intake
- **INT-03**: Real-time bank sync (Open Banking)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Invoice creation/generation | This is invoicing software territory (Green Invoice). Focus on RECEIVED documents. |
| Full accounting system | Crowded market. Focus on VAT preparation handoff TO accountants. |
| Payment processing | Regulatory complexity, not core to VAT problem. |
| Multi-currency reconciliation | Israeli VAT is in ILS. Simple display conversion only if needed. |
| Enterprise RBAC/permissions | SMB market doesn't need it initially. |
| Tax return preparation | Licensed accountant territory. Prepare data FOR accountants. |
| POS/retail integration | Different market segment. Focus on freelancer/SMB expense side. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| UPLD-01 | Phase 4 | Pending |
| UPLD-02 | Phase 4 | Pending |
| UPLD-03 | Phase 4 | Pending |
| EXTR-01 | Phase 7 | Pending |
| EXTR-02 | Phase 7 | Pending |
| EXTR-03 | Phase 8 | Pending |
| EXTR-04 | Phase 8 | Pending |
| EXTR-05 | Phase 8 | Pending |
| BANK-01 | Phase 5 | Pending |
| BANK-02 | Phase 5 | Pending |
| BANK-03 | Phase 6 | Pending |
| BANK-04 | Phase 5 | Pending |
| BANK-05 | Phase 6 | Pending |
| BANK-06 | Phase 6 | Pending |
| MTCH-01 | Phase 9 | Pending |
| MTCH-02 | Phase 9 | Pending |
| MTCH-03 | Phase 10 | Pending |
| MTCH-04 | Phase 10 | Pending |
| MTCH-05 | Phase 10 | Pending |
| DUPL-01 | Phase 11 | Pending |
| DUPL-02 | Phase 11 | Pending |
| DUPL-03 | Phase 11 | Pending |
| DASH-01 | Phase 12 | Pending |
| DASH-02 | Phase 12 | Pending |
| DASH-03 | Phase 12 | Pending |
| DASH-04 | Phase 12 | Pending |
| NAV-01 | Phase 3 | Pending |
| SETT-01 | Phase 9 | Pending |
| SETT-02 | Phase 12 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-01-27*
*Last updated: 2026-01-27 after roadmap creation*
