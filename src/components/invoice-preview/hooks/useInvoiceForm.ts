import { useState, useMemo, useCallback } from 'react'
import { agorotToShekel, shekelToAgorot } from '@/lib/utils/currency'
import type { Invoice, InvoiceRow, InvoiceUpdate, InvoiceRowInsert, InvoiceRowUpdate } from '@/types/database'

export interface InvoiceFormData {
  vendor_name: string
  invoice_number: string
  invoice_date: string
  currency: string
  subtotal: string
  vat_amount: string
  total_amount: string
}

export interface LineItemFormData {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  isNew?: boolean
}

export interface FormDataForSave {
  invoice: InvoiceUpdate
  lineItems: (InvoiceRowInsert | InvoiceRowUpdate)[]
  deletedRowIds: string[]
}

export interface UseInvoiceFormReturn {
  invoiceData: InvoiceFormData
  setInvoiceField: <K extends keyof InvoiceFormData>(
    field: K,
    value: InvoiceFormData[K]
  ) => void
  lineItems: LineItemFormData[]
  addLineItem: () => void
  updateLineItem: (
    id: string,
    field: keyof LineItemFormData,
    value: string | number
  ) => void
  removeLineItem: (id: string) => void
  isDirty: boolean
  getFormData: () => FormDataForSave
}

function formatAmountForDisplay(agorot: number | null): string {
  if (agorot === null || agorot === 0) return ''
  return agorotToShekel(agorot).toFixed(2)
}

function invoiceToFormData(invoice: Invoice): InvoiceFormData {
  return {
    vendor_name: invoice.vendor_name ?? '',
    invoice_number: invoice.invoice_number ?? '',
    invoice_date: invoice.invoice_date ?? '',
    currency: invoice.currency ?? 'ILS',
    subtotal: formatAmountForDisplay(invoice.subtotal_agorot),
    vat_amount: formatAmountForDisplay(invoice.vat_amount_agorot),
    total_amount: formatAmountForDisplay(invoice.total_amount_agorot),
  }
}

function invoiceRowToFormData(row: InvoiceRow): LineItemFormData {
  return {
    id: row.id,
    description: row.description ?? '',
    quantity: row.quantity ?? 0,
    unit_price: row.unit_price_agorot ? agorotToShekel(row.unit_price_agorot) : 0,
    total: row.total_agorot ? agorotToShekel(row.total_agorot) : 0,
    isNew: false,
  }
}

export function useInvoiceForm(
  invoice: Invoice,
  initialRows: InvoiceRow[]
): UseInvoiceFormReturn {
  const initialInvoiceData = useMemo(
    () => invoiceToFormData(invoice),
    [invoice]
  )

  const initialLineItems = useMemo(
    () => initialRows.map(invoiceRowToFormData),
    [initialRows]
  )

  const [invoiceData, setInvoiceData] =
    useState<InvoiceFormData>(initialInvoiceData)
  const [lineItems, setLineItems] =
    useState<LineItemFormData[]>(initialLineItems)
  const [deletedRowIds, setDeletedRowIds] = useState<string[]>([])

  // Track dirty state by comparing with initial values
  const isDirty = useMemo(() => {
    const invoiceChanged =
      JSON.stringify(invoiceData) !== JSON.stringify(initialInvoiceData)
    const itemsChanged =
      JSON.stringify(lineItems) !== JSON.stringify(initialLineItems)
    const hasDeleted = deletedRowIds.length > 0
    return invoiceChanged || itemsChanged || hasDeleted
  }, [invoiceData, initialInvoiceData, lineItems, initialLineItems, deletedRowIds])

  const setInvoiceField = useCallback(
    <K extends keyof InvoiceFormData>(field: K, value: InvoiceFormData[K]) => {
      setInvoiceData((prev) => ({ ...prev, [field]: value }))
    },
    []
  )

  const addLineItem = useCallback(() => {
    const newItem: LineItemFormData = {
      id: crypto.randomUUID(),
      description: '',
      quantity: 1,
      unit_price: 0,
      total: 0,
      isNew: true,
    }
    setLineItems((prev) => [...prev, newItem])
  }, [])

  const updateLineItem = useCallback(
    (id: string, field: keyof LineItemFormData, value: string | number) => {
      setLineItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item

          const updated = { ...item, [field]: value }

          // Auto-calculate total when quantity or unit_price changes
          if (field === 'quantity' || field === 'unit_price') {
            const qty = field === 'quantity' ? (value as number) : item.quantity
            const price =
              field === 'unit_price' ? (value as number) : item.unit_price
            updated.total = Number((qty * price).toFixed(2))
          }

          return updated
        })
      )
    },
    []
  )

  const removeLineItem = useCallback((id: string) => {
    setLineItems((prev) => {
      const item = prev.find((i) => i.id === id)
      if (item && !item.isNew) {
        // Track deleted existing items for database deletion
        setDeletedRowIds((ids) => [...ids, id])
      }
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const getFormData = useCallback((): FormDataForSave => {
    // Convert invoice form data to update format
    const invoiceUpdate: InvoiceUpdate = {
      vendor_name: invoiceData.vendor_name || null,
      invoice_number: invoiceData.invoice_number || null,
      invoice_date: invoiceData.invoice_date || null,
      currency: invoiceData.currency,
      subtotal_agorot: invoiceData.subtotal
        ? shekelToAgorot(parseFloat(invoiceData.subtotal))
        : null,
      vat_amount_agorot: invoiceData.vat_amount
        ? shekelToAgorot(parseFloat(invoiceData.vat_amount))
        : null,
      total_amount_agorot: invoiceData.total_amount
        ? shekelToAgorot(parseFloat(invoiceData.total_amount))
        : null,
    }

    // Convert line items to insert/update format
    const lineItemsForSave = lineItems.map((item) => {
      const baseData = {
        description: item.description || null,
        quantity: item.quantity || null,
        unit_price_agorot: item.unit_price
          ? shekelToAgorot(item.unit_price)
          : null,
        total_agorot: item.total ? shekelToAgorot(item.total) : null,
      }

      if (item.isNew) {
        // New items need invoice_id (will be set by the mutation)
        return {
          ...baseData,
          invoice_id: invoice.id,
        } as InvoiceRowInsert
      } else {
        // Existing items need id for update
        return {
          id: item.id,
          ...baseData,
        } as InvoiceRowUpdate
      }
    })

    return {
      invoice: invoiceUpdate,
      lineItems: lineItemsForSave,
      deletedRowIds,
    }
  }, [invoiceData, lineItems, deletedRowIds, invoice.id])

  return {
    invoiceData,
    setInvoiceField,
    lineItems,
    addLineItem,
    updateLineItem,
    removeLineItem,
    isDirty,
    getFormData,
  }
}
