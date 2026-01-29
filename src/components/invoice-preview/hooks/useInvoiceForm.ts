import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
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
  reference_id: string
  transaction_date: string
  amount: number
  currency: string
  vat_rate: number | null
  vat_amount: number | null
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
    value: string | number | null
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
    reference_id: row.reference_id ?? '',
    transaction_date: row.transaction_date ?? '',
    amount: row.total_agorot ? agorotToShekel(row.total_agorot) : 0,
    currency: row.currency ?? 'ILS',
    vat_rate: row.vat_rate,
    vat_amount: row.vat_amount_agorot ? agorotToShekel(row.vat_amount_agorot) : null,
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

  // Sync invoice data when extraction completes (invoice.id changes from empty to real)
  // This happens when user clicks Extract and the API returns with data
  const [lastSyncedInvoiceId, setLastSyncedInvoiceId] = useState(invoice.id)

  useEffect(() => {
    // If invoice ID changed (e.g., from '' to a real ID after extraction), sync all data
    if (invoice.id !== lastSyncedInvoiceId) {
      setInvoiceData(initialInvoiceData)
      setLineItems(initialLineItems)
      setDeletedRowIds([])
      setLastSyncedInvoiceId(invoice.id)
    }
  }, [invoice.id, lastSyncedInvoiceId, initialInvoiceData, initialLineItems])

  // Sync line items when initial data arrives (e.g., from async query)
  // Only sync if current state is empty and new data has items
  useEffect(() => {
    if (lineItems.length === 0 && initialLineItems.length > 0) {
      setLineItems(initialLineItems)
    }
  }, [initialLineItems, lineItems.length])

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
      reference_id: '',
      transaction_date: '',
      amount: 0,
      currency: invoiceData.currency || 'ILS',
      vat_rate: null,
      vat_amount: null,
      isNew: true,
    }
    setLineItems((prev) => [...prev, newItem])
  }, [invoiceData.currency])

  const updateLineItem = useCallback(
    (id: string, field: keyof LineItemFormData, value: string | number | null) => {
      setLineItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item
          return { ...item, [field]: value }
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
        reference_id: item.reference_id || null,
        transaction_date: item.transaction_date || null,
        total_agorot: item.amount ? shekelToAgorot(item.amount) : null,
        currency: item.currency || 'ILS',
        vat_rate: item.vat_rate,
        vat_amount_agorot: item.vat_amount ? shekelToAgorot(item.vat_amount) : null,
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
