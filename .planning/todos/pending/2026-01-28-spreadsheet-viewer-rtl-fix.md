---
created: 2026-01-28T00:30
title: Fix spreadsheet viewer RTL display issues
area: ui
files:
  - src/components/invoice-preview/previews/SpreadsheetPreview.tsx
---

## Problem

The current custom SpreadsheetPreview component does not display CSV/XLSX files correctly when content contains mixed Hebrew (RTL) and English (LTR) text. The bidirectional text handling causes layout issues making the data hard to read.

Current implementation uses:
- SheetJS (xlsx) for parsing
- Custom React table for rendering
- `dir="auto"` and `<bdi>` elements for RTL handling

This approach is insufficient for proper spreadsheet viewing with mixed language content.

## Solution

Replace custom SpreadsheetPreview with a proper spreadsheet viewer library that has:
- Built-in zoom in/out controls
- Proper bidirectional text support
- Excel-like toolbar and navigation
- Better visual presentation

Candidates to evaluate:
- fortune-sheet (MIT, Excel-like features)
- x-spreadsheet (lightweight)
- Luckysheet (full Excel features)

The user previously used a viewer library with these features in another project but couldn't locate it in git history.
