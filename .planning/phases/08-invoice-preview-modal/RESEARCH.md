# Research: Invoice Preview Modal

**Domain:** Document viewing modal with split view, file preview, and data editing
**Researched:** 2026-01-28
**Overall confidence:** HIGH

## Executive Summary

This research investigates the optimal libraries and patterns for building a large invoice preview modal with split view layout (file preview on left, extracted data form on right). The project already uses React 19, react-aria-components, Tailwind CSS, and SheetJS (xlsx) - these constraints inform the recommendations.

**Key finding:** The stack should be react-resizable-panels (split view) + @react-pdf-viewer/core (PDF with RTL) + SheetJS HTML rendering (XLSX/CSV) + react-zoom-pan-pinch (images). This combination provides the best balance of RTL support, bundle size, and integration simplicity.

---

## 1. File Viewer Libraries

### 1.1 PDF Viewers

#### Recommendation: @react-pdf-viewer/core

| Library | RTL Support | Bundle Size | Maintenance | React 19 | Verdict |
|---------|-------------|-------------|-------------|----------|---------|
| [@react-pdf-viewer/core](https://react-pdf-viewer.dev/) | **Explicit** (Hebrew, Arabic, etc.) | ~200KB + PDF.js | Active | Compatible | **RECOMMENDED** |
| [react-pdf](https://www.npmjs.com/package/react-pdf) (wojtekmaj) | Partial (RTL requested) | ~117KB gzipped + PDF.js | Active | Compatible | Good alternative |
| Syncfusion | Full | Commercial | Active | Compatible | Commercial option |

**Why @react-pdf-viewer/core:**
- Explicit RTL language support including Hebrew, Arabic, Farsi
- Plugin architecture for selective feature loading
- TypeScript support
- Well-documented API

**RTL Configuration Example:**
```typescript
import { TextDirection, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';

<Viewer
  fileUrl={pdfUrl}
  theme={{
    direction: TextDirection.RightToLeft,
  }}
/>
```

**Plugins to use:**
- `@react-pdf-viewer/default-layout` - Full toolbar, sidebar, thumbnails
- `@react-pdf-viewer/page-navigation` - Page controls
- `@react-pdf-viewer/zoom` - Zoom controls

**Licensing Note:** Commercial use requires purchasing a license from react-pdf-viewer.dev. For open-source/personal use, it's free.

**Alternative - react-pdf:**
If licensing is a concern, `react-pdf` by wojtekmaj is MIT-licensed and wraps PDF.js. RTL support is less mature but PDF.js handles Hebrew text rendering correctly. The RTL issue is mainly for UI direction, not text rendering.

```typescript
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

<Document file={pdfUrl}>
  <Page pageNumber={1} />
</Document>
```

---

### 1.2 XLSX/CSV Viewers

#### Recommendation: SheetJS + Custom Table Rendering

The project already has SheetJS (`xlsx`) installed. Rather than adding another heavy library, use SheetJS to parse and render as HTML/React table.

| Library | RTL | Bundle Size | Cost | Verdict |
|---------|-----|-------------|------|---------|
| **SheetJS + Custom Table** | App-level | Already included | Free | **RECOMMENDED** |
| react-spreadsheet | Basic | ~15KB | Free | Lightweight option |
| Syncfusion Spreadsheet | Full | ~500KB+ | Commercial | Enterprise |
| Handsontable | Full | ~150KB+ | Commercial | Excel-like editing |
| AG Grid | Full | ~90KB+ | Commercial (advanced) | Data-heavy |

**Implementation Approach:**

```typescript
import * as XLSX from 'xlsx';

interface SpreadsheetViewerProps {
  file: File;
}

export function SpreadsheetViewer({ file }: SpreadsheetViewerProps) {
  const [data, setData] = useState<unknown[][]>([]);

  useEffect(() => {
    async function parseFile() {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: 'array',
        codepage: 65001, // UTF-8 for Hebrew
      });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
      setData(rows);
    }
    parseFile();
  }, [file]);

  return (
    <div className="overflow-auto" dir="auto">
      <table className="min-w-full border-collapse">
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {(row as unknown[]).map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border border-border px-2 py-1 text-sm"
                  dir="auto" // BiDi auto-detection per cell
                >
                  {String(cell ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**RTL/BiDi Handling:**
- Use `dir="auto"` on table cells for automatic BiDi detection
- Hebrew text will render RTL, English text LTR
- This matches Google Sheets behavior

---

### 1.3 Image Viewers

#### Recommendation: react-zoom-pan-pinch

| Library | Features | Bundle Size | Maintenance | Verdict |
|---------|----------|-------------|-------------|---------|
| [react-zoom-pan-pinch](https://www.npmjs.com/package/react-zoom-pan-pinch) | Zoom, pan, pinch, animations | ~20KB | Active | **RECOMMENDED** |
| Native `<img>` | Basic | 0 | N/A | Minimal viable |
| react-image-gallery | Gallery focus | ~30KB | Active | Overkill for single image |

**Why react-zoom-pan-pinch:**
- Touch gestures (mobile)
- Mouse wheel zoom (desktop)
- Customizable controls
- Light bundle size
- No external dependencies

**Implementation:**
```typescript
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch';

function ImageViewer({ src, alt }: { src: string; alt: string }) {
  return (
    <TransformWrapper
      initialScale={1}
      minScale={0.5}
      maxScale={4}
      centerOnInit
    >
      {({ zoomIn, zoomOut, resetTransform }) => (
        <>
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <button onClick={() => zoomIn()}>
              <MagnifyingGlassPlusIcon className="h-5 w-5" />
            </button>
            <button onClick={() => zoomOut()}>
              <MagnifyingGlassMinusIcon className="h-5 w-5" />
            </button>
            <button onClick={() => resetTransform()}>
              <ArrowsPointingOutIcon className="h-5 w-5" />
            </button>
          </div>
          <TransformComponent>
            <img src={src} alt={alt} className="max-w-full max-h-full" />
          </TransformComponent>
        </>
      )}
    </TransformWrapper>
  );
}
```

---

## 2. Resizable Split Panels

#### Recommendation: react-resizable-panels

| Library | Bundle Size | Features | TypeScript | Maintenance | Verdict |
|---------|-------------|----------|------------|-------------|---------|
| [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | ~10KB | Full | Yes | Active (bvaughn) | **RECOMMENDED** |
| [allotment](https://github.com/johnwalley/allotment) | ~15KB | VS Code-like | Yes | Active | Good alternative |
| react-split-pane | ~20KB | Basic | Partial | Less active | Avoid |

**Why react-resizable-panels:**
- Created by Brian Vaughn (former React core team)
- 317K+ weekly downloads, 5.1K stars
- Flexible units (px, %, rem, vh)
- Server-side rendering support
- Accessibility (keyboard navigation)
- Collapsible panels

**Implementation:**
```typescript
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

function SplitView() {
  return (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={50} minSize={30}>
        {/* File Preview */}
      </Panel>

      <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors cursor-col-resize" />

      <Panel defaultSize={50} minSize={30}>
        {/* Extracted Data Form */}
      </Panel>
    </PanelGroup>
  );
}
```

**Drag handle styling:**
```css
/* Custom resize handle with visual feedback */
.resize-handle {
  @apply w-1 bg-border hover:bg-primary/50 active:bg-primary transition-colors;
  cursor: col-resize;
}

.resize-handle:focus-visible {
  @apply outline-2 outline-primary;
}
```

---

## 3. Modal Structure

### Using Existing Modal Component

The project has a modal component at `src/components/ui/base/modal/modal.tsx` using react-aria-components. Extend it for the large split-view layout:

```typescript
// InvoicePreviewModal structure
<Modal.Trigger>
  <AriaModalOverlay>
    <AriaModal className="w-[90vw] max-w-7xl h-[85vh]">
      <AriaDialog className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <Modal.Title>Invoice Preview</Modal.Title>
          <button onClick={close}>
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Split View Body */}
        <PanelGroup direction="horizontal" className="flex-1 min-h-0">
          <Panel>
            <FilePreview file={file} />
          </Panel>
          <PanelResizeHandle />
          <Panel>
            <ExtractedDataForm data={extractedData} />
          </Panel>
        </PanelGroup>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-4 py-3 border-t border-border">
          <Button variant="secondary" onPress={close}>Cancel</Button>
          <Button variant="primary" onPress={save}>Save</Button>
        </div>
      </AriaDialog>
    </AriaModal>
  </AriaModalOverlay>
</Modal.Trigger>
```

---

## 4. Extracted Data Form

### Form Architecture

The right panel displays editable extracted invoice data. Based on the existing `InvoiceExtraction` type:

```typescript
interface InvoiceExtraction {
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  currency: string;
  confidence: number;
  line_items: LineItem[];
}
```

### Form Structure

```typescript
function ExtractedDataForm({ data, onSave }: Props) {
  const [formData, setFormData] = useState(data);

  return (
    <form className="h-full flex flex-col overflow-hidden">
      {/* Metadata Section */}
      <div className="p-4 space-y-4 overflow-y-auto flex-shrink-0">
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Vendor Name" value={formData.vendor_name} />
          <TextField label="Invoice Number" value={formData.invoice_number} />
          <DateField label="Invoice Date" value={formData.invoice_date} />
          <CurrencyField label="Currency" value={formData.currency} />
        </div>

        {/* Amounts */}
        <div className="grid grid-cols-3 gap-4">
          <NumberField label="Subtotal" value={formData.subtotal} />
          <NumberField label="VAT Amount" value={formData.vat_amount} />
          <NumberField label="Total" value={formData.total_amount} />
        </div>
      </div>

      {/* Line Items Table - Scrollable */}
      <div className="flex-1 min-h-0 p-4 overflow-y-auto">
        <LineItemsTable
          items={formData.line_items}
          onAdd={handleAddItem}
          onUpdate={handleUpdateItem}
          onDelete={handleDeleteItem}
        />
      </div>
    </form>
  );
}
```

### Line Items Table (Editable)

Implement in-cell editing for line items:

```typescript
function LineItemsTable({ items, onAdd, onUpdate, onDelete }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Line Items</h3>
        <button onClick={onAdd} className="text-primary text-sm">
          <PlusIcon className="h-4 w-4 inline mr-1" />
          Add Item
        </button>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-surface/50">
          <tr>
            <th className="text-start px-2 py-1">Description</th>
            <th className="text-center px-2 py-1 w-20">Qty</th>
            <th className="text-end px-2 py-1 w-24">Unit Price</th>
            <th className="text-end px-2 py-1 w-24">Total</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <LineItemRow
              key={index}
              item={item}
              onUpdate={(updated) => onUpdate(index, updated)}
              onDelete={() => onDelete(index)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineItemRow({ item, onUpdate, onDelete }: Props) {
  return (
    <tr className="border-b border-border/50">
      <td className="px-2 py-1">
        <input
          type="text"
          value={item.description ?? ''}
          onChange={(e) => onUpdate({ ...item, description: e.target.value })}
          className="w-full bg-transparent border-0 focus:ring-1 focus:ring-primary rounded"
          dir="auto" // BiDi support
        />
      </td>
      <td className="px-2 py-1 text-center">
        <input
          type="number"
          value={item.quantity ?? ''}
          onChange={(e) => onUpdate({ ...item, quantity: parseFloat(e.target.value) })}
          className="w-full text-center bg-transparent border-0 focus:ring-1 focus:ring-primary rounded"
        />
      </td>
      <td className="px-2 py-1 text-end">
        <input
          type="number"
          step="0.01"
          value={item.unit_price ?? ''}
          onChange={(e) => onUpdate({ ...item, unit_price: parseFloat(e.target.value) })}
          className="w-full text-end bg-transparent border-0 focus:ring-1 focus:ring-primary rounded"
        />
      </td>
      <td className="px-2 py-1 text-end">
        <input
          type="number"
          step="0.01"
          value={item.total ?? ''}
          onChange={(e) => onUpdate({ ...item, total: parseFloat(e.target.value) })}
          className="w-full text-end bg-transparent border-0 focus:ring-1 focus:ring-primary rounded"
        />
      </td>
      <td className="px-2 py-1">
        <button onClick={onDelete} className="text-red-400 hover:text-red-300">
          <TrashIcon className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
```

---

## 5. RTL/BiDi Strategy

### Critical Requirements

Hebrew invoices require proper BiDi (bidirectional) text handling:

1. **PDF Viewer:** Use `TextDirection.RightToLeft` for UI, PDF.js handles text rendering
2. **Spreadsheet:** Use `dir="auto"` on cells for automatic direction detection
3. **Form Fields:** Use `dir="auto"` on all text inputs
4. **Modal:** Keep modal LTR (standard UI), let content be BiDi

### Implementation Pattern

```typescript
// BiDi-aware text input
function BiDiTextField({ value, onChange, ...props }: Props) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      dir="auto" // Browser detects text direction
      {...props}
    />
  );
}

// For explicitly Hebrew content
function HebrewText({ children }: { children: React.ReactNode }) {
  return <span dir="rtl">{children}</span>;
}
```

### Google Workspace-like Behavior

Google Docs/Sheets behavior for mixed content:
1. Container is LTR (app shell)
2. Content areas use `dir="auto"`
3. User can manually toggle direction per cell/paragraph
4. Text alignment follows direction

---

## 6. Component Inventory from Untitled UI

Untitled UI components that align with the project (built with React Aria + Tailwind):

| Component | Use Case | Availability |
|-----------|----------|--------------|
| **Modal** | 46 variants | Available - large split view variant needed |
| **Tables** | 12 components | Available - for line items |
| **Inputs** | 10 variants | Available - text, number fields |
| **Buttons** | 13 variants | Available - actions |
| **Badges** | 25 variants | Available - status indicators |
| **Tooltips** | 11 variants | Available - help text |
| **Dropdowns** | 3 variants | Available - currency select |

The project already has some Untitled UI components. Leverage existing patterns:
- `src/components/ui/base/modal/modal.tsx`
- `src/components/ui/application/table/table.tsx`
- `src/components/ui/base/dropdown/dropdown.tsx`

---

## 7. What to Avoid

### Libraries to Avoid

| Library | Reason |
|---------|--------|
| **react-split-pane** | Less maintained, older API |
| **pdfjs-dist** direct | Use wrapper libraries instead |
| **Handsontable** (free tier) | Commercial-only for production |
| **AG Grid** (advanced features) | Overkill for read-only preview |
| **react-pdf-js** | Older wrapper, less maintained |

### Common Pitfalls

1. **PDF Worker Configuration**
   - PDF.js requires a web worker for parsing
   - Must configure worker URL correctly
   - Version mismatch between library and worker causes errors

   ```typescript
   // Correct worker setup for react-pdf
   import { pdfjs } from 'react-pdf';
   pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
   ```

2. **Canvas Scaling Issues**
   - PDF canvas must match container size
   - Use ResizeObserver for responsive rendering

3. **Memory Leaks with Large PDFs**
   - Release page resources when unmounting
   - Don't render all pages at once

4. **XLSX Parsing on Main Thread**
   - Large files block UI
   - Consider Web Worker for parsing

5. **Modal Scroll Trapping**
   - Body scroll should be locked when modal open
   - react-aria handles this automatically

### Security Concerns

- **PDF.js CVE-2024-4367/CVE-2024-34342**: Arbitrary code execution vulnerability
- **Mitigation**: Keep pdfjs-dist updated, use `isEvalSupported: false`
- react-pdf has patched this by default

---

## 8. Architecture Decision

### Component Structure

```
src/components/invoice-preview/
  InvoicePreviewModal.tsx      # Main modal component
  FilePreview.tsx              # File type router
  previews/
    PdfPreview.tsx             # PDF viewer with RTL
    SpreadsheetPreview.tsx     # XLSX/CSV viewer
    ImagePreview.tsx           # Image with zoom/pan
  ExtractedDataPanel.tsx       # Form panel
  LineItemsTable.tsx           # Editable line items
  hooks/
    useFilePreview.ts          # File loading/parsing
    useInvoiceForm.ts          # Form state management
```

### Data Flow

```
InvoicePreviewModal
  |
  +-- PanelGroup (react-resizable-panels)
        |
        +-- Panel (left)
        |     +-- FilePreview
        |           +-- PdfPreview / SpreadsheetPreview / ImagePreview
        |
        +-- PanelResizeHandle
        |
        +-- Panel (right)
              +-- ExtractedDataPanel
                    +-- Form fields
                    +-- LineItemsTable
```

---

## 9. Bundle Size Impact

### Estimated Additions

| Package | Minified | Gzipped | Notes |
|---------|----------|---------|-------|
| react-resizable-panels | ~30KB | ~10KB | Lightweight |
| @react-pdf-viewer/core | ~600KB | ~200KB | Includes PDF.js |
| react-zoom-pan-pinch | ~50KB | ~15KB | No dependencies |
| **Total** | ~680KB | ~225KB | + PDF.js worker (~700KB, loaded separately) |

### Optimization Strategies

1. **Lazy load viewers**: Only load PDF viewer when viewing PDFs
2. **PDF.js worker**: Loaded separately, doesn't block initial bundle
3. **Code splitting**: Dynamic imports for preview components

```typescript
// Lazy load heavy components
const PdfPreview = lazy(() => import('./previews/PdfPreview'));
const SpreadsheetPreview = lazy(() => import('./previews/SpreadsheetPreview'));
const ImagePreview = lazy(() => import('./previews/ImagePreview'));
```

---

## 10. Recommended Implementation Order

1. **Phase 1: Modal Shell**
   - Extend existing modal for large split view
   - Implement react-resizable-panels layout
   - Basic file type detection

2. **Phase 2: Image Viewer**
   - Simplest viewer to implement
   - Add react-zoom-pan-pinch
   - Test zoom/pan functionality

3. **Phase 3: Spreadsheet Viewer**
   - Use existing SheetJS
   - Build table renderer with BiDi support
   - Test with Hebrew XLSX files

4. **Phase 4: PDF Viewer**
   - Most complex integration
   - Add @react-pdf-viewer/core
   - Configure RTL support
   - Handle worker setup

5. **Phase 5: Extracted Data Form**
   - Build editable form fields
   - Implement line items table
   - Add save functionality

---

## Sources

### PDF Viewers
- [React PDF Viewer (react-pdf-viewer.dev)](https://react-pdf-viewer.dev/)
- [RTL Language Support Example](https://react-pdf-viewer.dev/examples/use-a-rtl-language/)
- [react-pdf npm](https://www.npmjs.com/package/react-pdf)
- [GitHub - wojtekmaj/react-pdf](https://github.com/wojtekmaj/react-pdf)

### Spreadsheet/XLSX
- [SheetJS Documentation](https://docs.sheetjs.com/docs/demos/frontend/react/)
- [Syncfusion React Spreadsheet](https://www.syncfusion.com/spreadsheet-editor-sdk/react-spreadsheet-editor)

### Resizable Panels
- [GitHub - bvaughn/react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [react-resizable-panels documentation](https://react-resizable-panels.vercel.app/)
- [GitHub - johnwalley/allotment](https://github.com/johnwalley/allotment)

### Image Viewers
- [GitHub - BetterTyped/react-zoom-pan-pinch](https://github.com/BetterTyped/react-zoom-pan-pinch)
- [react-zoom-pan-pinch npm](https://www.npmjs.com/package/react-zoom-pan-pinch)

### Security
- [Critical PDF.js & React-PDF Vulnerabilities](https://gbhackers.com/pdf-js-react-pdf-vulnerabilities-threat/)

### UI Components
- [Untitled UI React Components](https://www.untitledui.com/react/components)
