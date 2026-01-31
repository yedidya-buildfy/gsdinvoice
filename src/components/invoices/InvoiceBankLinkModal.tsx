/**
 * Modal for viewing and managing line item to transaction links
 * Shows line items on the left, corresponding linked transactions on the right (mirrored rows)
 * Document links section at the bottom of both columns
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  CreditCardIcon,
  BanknotesIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentIcon,
  PlusIcon,
  CheckIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  AdjustmentsHorizontalIcon,
  CurrencyDollarIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline'
import { Modal } from '@/components/ui/base/modal/modal'
import { RangeCalendarCard } from '@/components/ui/date-picker'
import { formatCurrency, formatTransactionAmount, formatLineItemAmount } from '@/lib/currency'
import { formatDisplayDate } from '@/lib/utils/dateFormatter'
import { calculateVatFromTotal } from '@/lib/utils/vatCalculator'
import { parseDescriptionParts } from '@/lib/utils/merchantParser'
import { supabase } from '@/lib/supabase'
import {
  linkLineItemToTransaction,
  unlinkLineItemFromTransaction,
  scoreTransactionCandidate,
  type TransactionWithCard,
} from '@/lib/services/lineItemMatcher'
import { useCreditCards } from '@/hooks/useCreditCards'
import { useSettingsStore } from '@/stores/settingsStore'
import type { InvoiceRow, Transaction, Invoice, CreditCard } from '@/types/database'

type TransactionTypeFilter = 'all' | 'cc_purchase' | 'bank_regular'

interface LineItemWithTransaction extends InvoiceRow {
  transaction?: Transaction | null
}

interface InvoiceBankLinkModalProps {
  isOpen: boolean
  onClose: () => void
  invoiceId: string
  vendorName?: string | null
  invoiceNumber?: string | null
  onLinkChange?: () => void
}

// Calculate date range around a given date
function calculateDateRange(dateStr: string | null, daysBefore: number, daysAfter: number): { from: string; to: string } {
  const date = dateStr ? new Date(dateStr) : new Date()
  const from = new Date(date)
  from.setDate(from.getDate() - daysBefore)
  const to = new Date(date)
  to.setDate(to.getDate() + daysAfter)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

// Amount tolerance presets
const TOLERANCE_OPTIONS = [
  { value: -1, label: 'Not relevant' },
  { value: 0, label: 'Exact' },
  { value: 5, label: '5%' },
  { value: 10, label: '10%' },
  { value: 20, label: '20%' },
  { value: 50, label: '50%' },
]

// Currency options
const CURRENCY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'ILS', label: 'ILS' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
]

// Dropdown filter component matching app theme
function FilterDropdown({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  options: Array<{ value: string | number; label: string }>
  onChange: (value: string | number) => void
}) {
  const selectedOption = options.find(opt => opt.value === value)

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-sm"
      >
        <Icon className="w-4 h-4 text-text-muted" />
        <span>{label} {selectedOption?.label}</span>
      </button>
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[150px] overflow-y-auto">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`w-full text-start px-3 py-2 text-sm hover:bg-background/50 transition-colors ${
              opt.value === value ? 'text-primary bg-primary/10' : 'text-text'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Card multi-select component
function CardMultiSelect({
  cards,
  value,
  onChange,
}: {
  cards: CreditCard[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const toggleCard = (cardId: string) => {
    if (value.includes(cardId)) {
      onChange(value.filter((id) => id !== cardId))
    } else {
      onChange([...value, cardId])
    }
  }

  const getCardDisplay = (card: CreditCard) => {
    return card.card_name || `-${card.card_last_four}`
  }

  const displayText =
    value.length === 0
      ? 'All Cards'
      : value.length === 1
        ? getCardDisplay(cards.find((c) => c.id === value[0])!)
        : `${value.length} cards`

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-sm"
      >
        <CreditCardIcon className="w-4 h-4 text-text-muted" />
        <span>{displayText}</span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange([])
            }}
            className="p-0.5 rounded hover:bg-background/50"
          >
            <XMarkIcon className="w-3.5 h-3.5 text-text-muted hover:text-text" />
          </button>
        )}
      </button>
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[200px] max-h-[300px] overflow-y-auto">
        <label className="flex items-center gap-2 px-3 py-2 hover:bg-background/50 cursor-pointer text-sm border-b border-text-muted/10">
          <input
            type="checkbox"
            checked={value.length === 0}
            onChange={() => onChange([])}
            className="checkbox-dark"
          />
          <span className="text-text font-medium">All Cards</span>
        </label>
        {cards.map((card) => (
          <label
            key={card.id}
            className="flex items-center gap-2 px-3 py-2 hover:bg-background/50 cursor-pointer text-sm"
          >
            <input
              type="checkbox"
              checked={value.includes(card.id)}
              onChange={() => toggleCard(card.id)}
              className="checkbox-dark"
            />
            <div className="flex flex-col">
              <span className="text-text">{card.card_name || 'Unnamed Card'}</span>
              <span className="text-xs text-text-muted">*{card.card_last_four}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

// Vendor filter component - kept for future use when filter is re-enabled
// @ts-expect-error Kept for future use
function _VendorFilter({
  vendors,
  value,
  onChange,
}: {
  vendors: string[]
  value: string
  onChange: (vendor: string) => void
}) {
  void vendors; void value; void onChange;
  return (
    <div className="relative group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-sm"
      >
        <BuildingOfficeIcon className="w-4 h-4 text-text-muted" />
        <span dir="auto">Vendor {value || 'All'}</span>
      </button>
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-text-muted/20 rounded-lg shadow-lg min-w-[200px] max-h-[300px] overflow-y-auto">
        <button
          type="button"
          onClick={() => onChange('')}
          className={`w-full text-start px-3 py-2 text-sm hover:bg-background/50 transition-colors ${
            value === '' ? 'text-primary bg-primary/10' : 'text-text'
          }`}
        >
          All Vendors
        </button>
        {vendors.map((vendor) => (
          <button
            key={vendor}
            type="button"
            onClick={() => onChange(vendor)}
            className={`w-full text-start px-3 py-2 text-sm hover:bg-background/50 transition-colors ${
              value === vendor ? 'text-primary bg-primary/10' : 'text-text'
            }`}
            dir="auto"
          >
            {vendor}
          </button>
        ))}
      </div>
    </div>
  )
}


function TransactionTypeBadge({ type }: { type: string | null }) {
  if (type === 'cc_purchase') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
        <CreditCardIcon className="w-3 h-3" />
        CC
      </span>
    )
  }
  if (type === 'bank_regular') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
        <BanknotesIcon className="w-3 h-3" />
        Bank
      </span>
    )
  }
  return null
}

// Number badge component
function NumberBadge({ number, linked, isDoc }: { number: number | string; linked?: boolean; isDoc?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-xs font-medium ${
        linked
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : isDoc
            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
            : 'bg-text-muted/20 text-text-muted border border-text-muted/30'
      }`}
    >
      {number}
    </span>
  )
}

export function InvoiceBankLinkModal({
  isOpen,
  onClose,
  invoiceId,
  vendorName: propVendorName,
  invoiceNumber: propInvoiceNumber,
  onLinkChange,
}: InvoiceBankLinkModalProps) {
  // Credit cards for filter
  const { creditCards } = useCreditCards()

  // Settings store for defaults
  const {
    linkingDateRangeDays: defaultDateRangeDays,
    linkingAmountTolerance: defaultAmountTolerance,
    linkingDefaultCurrency: defaultCurrency,
  } = useSettingsStore()

  // State
  const [allRows, setAllRows] = useState<LineItemWithTransaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invoiceData, setInvoiceData] = useState<Pick<Invoice, 'vendor_name' | 'invoice_number'> | null>(null)

  // Use prop values if provided, otherwise use fetched invoice data
  const vendorName = propVendorName ?? invoiceData?.vendor_name
  const invoiceNumber = propInvoiceNumber ?? invoiceData?.invoice_number

  // Editing state - which row is being edited
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editingRowType, setEditingRowType] = useState<'line-item' | 'doc-link' | 'new-doc-link' | null>(null)

  // Hover state
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)

  // Candidates
  const [candidates, setCandidates] = useState<TransactionWithCard[]>([])
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidateDateFrom, setCandidateDateFrom] = useState('')
  const [candidateDateTo, setCandidateDateTo] = useState('')
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<TransactionTypeFilter>('all')

  // Advanced filters
  const [amountTolerance, setAmountTolerance] = useState(20)
  const [currencyFilter, setCurrencyFilter] = useState<string>('all')
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [vendorFilter, setVendorFilter] = useState<string>('')

  // Sorting state for candidate transactions
  type SortColumn = 'match' | 'date' | 'amount' | 'description'
  type SortDirection = 'asc' | 'desc'
  const [sortColumn, setSortColumn] = useState<SortColumn>('match')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      // Default direction: desc for match/amount, asc for date/description
      setSortDirection(column === 'match' || column === 'amount' ? 'desc' : 'asc')
    }
  }

  // Separate line items from document links
  const lineItems = useMemo(() => allRows.filter((row) => !row.is_document_link), [allRows])
  const documentLinks = useMemo(() => allRows.filter((row) => row.is_document_link), [allRows])

  // Get the line item being edited (for display purposes)
  const editingLineItem = useMemo(() => {
    if (editingRowType === 'line-item' && editingRowId) {
      return lineItems.find((item) => item.id === editingRowId) || null
    }
    return null
  }, [editingRowId, editingRowType, lineItems])

  const editingLineItemIndex = useMemo(() => {
    if (editingLineItem) {
      return lineItems.findIndex((item) => item.id === editingLineItem.id)
    }
    return -1
  }, [editingLineItem, lineItems])

  // Fetch all rows
  const fetchAllRows = useCallback(async () => {
    if (!invoiceId) return

    setIsLoading(true)
    setError(null)

    try {
      // Fetch invoice data for vendor name and invoice number
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('vendor_name, invoice_number')
        .eq('id', invoiceId)
        .single()

      if (invoiceError) {
        console.error('Error fetching invoice:', invoiceError)
      } else if (invoice) {
        setInvoiceData(invoice)
      }

      const { data: rowsData, error: rowsError } = await supabase
        .from('invoice_rows')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('is_document_link', { ascending: true })
        .order('created_at', { ascending: true })

      if (rowsError) throw rowsError

      const transactionIds = (rowsData || [])
        .filter((row) => row.transaction_id)
        .map((row) => row.transaction_id as string)

      let transactionsMap = new Map<string, Transaction>()

      if (transactionIds.length > 0) {
        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .select('*')
          .in('id', transactionIds)

        if (txError) {
          console.error('Error fetching transactions:', txError)
        } else if (txData) {
          txData.forEach((tx) => {
            transactionsMap.set(tx.id, tx)
          })
        }
      }

      setAllRows(
        (rowsData || []).map((row) => ({
          ...row,
          transaction: row.transaction_id ? transactionsMap.get(row.transaction_id) || null : null,
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    if (isOpen && invoiceId) {
      fetchAllRows()
    }
  }, [isOpen, invoiceId, fetchAllRows])

  // Fetch ALL transactions when editing (no amount/date filtering)
  useEffect(() => {
    if (!editingRowId) {
      setCandidates([])
      return
    }

    async function fetchAllTransactions() {
      setIsLoadingCandidates(true)
      try {
        // Build query for all matchable transactions
        let query = supabase
          .from('transactions')
          .select(`
            *,
            credit_cards!credit_card_id(card_last_four, card_name, card_type)
          `)
          .in('transaction_type', ['bank_regular', 'cc_purchase'])
          .order('date', { ascending: false })
          .limit(500)

        const { data, error } = await query

        if (error) {
          console.error('Error fetching transactions:', error)
          setCandidates([])
          return
        }

        // Map the results
        const mapped: TransactionWithCard[] = (data || []).map((tx) => ({
          ...tx,
          credit_card: tx.credit_cards as TransactionWithCard['credit_card'],
        }))

        setCandidates(mapped)
      } catch (err) {
        console.error('Failed to fetch candidates:', err)
        setCandidates([])
      } finally {
        setIsLoadingCandidates(false)
      }
    }

    fetchAllTransactions()
  }, [editingRowId])

  const filteredCandidates = useMemo(() => {
    let filtered = candidates
    // Filter by transaction type
    if (transactionTypeFilter !== 'all') {
      filtered = filtered.filter((tx) => tx.transaction_type === transactionTypeFilter)
    }
    // Filter by date range
    if (candidateDateFrom) filtered = filtered.filter((tx) => tx.date >= candidateDateFrom)
    if (candidateDateTo) filtered = filtered.filter((tx) => tx.date <= candidateDateTo)
    // Filter by search query
    if (candidateSearch) {
      const searchLower = candidateSearch.toLowerCase()
      filtered = filtered.filter((tx) => tx.description.toLowerCase().includes(searchLower))
    }

    // Filter by amount tolerance (if not "not relevant" and there's an editing line item)
    if (amountTolerance !== -1 && editingLineItem && editingLineItem.total_agorot) {
      const lineItemAmount = Math.abs(editingLineItem.total_agorot)
      const tolerance = lineItemAmount * (amountTolerance / 100)
      filtered = filtered.filter((tx) => {
        const txAmount = Math.abs(tx.amount_agorot)
        const diff = Math.abs(txAmount - lineItemAmount)
        return diff <= tolerance
      })
    }

    // Filter by currency
    if (currencyFilter !== 'all') {
      filtered = filtered.filter((tx) => {
        // Check if foreign currency matches, or if ILS selected and no foreign currency
        if (currencyFilter === 'ILS') {
          return tx.foreign_currency === null || tx.foreign_currency === 'ILS'
        }
        return tx.foreign_currency === currencyFilter
      })
    }

    // Filter by credit card
    if (selectedCardIds.length > 0) {
      filtered = filtered.filter((tx) =>
        tx.credit_card_id && selectedCardIds.includes(tx.credit_card_id)
      )
    }

    // Filter by vendor (from description)
    if (vendorFilter) {
      const vendorLower = vendorFilter.toLowerCase()
      filtered = filtered.filter((tx) =>
        tx.description.toLowerCase().includes(vendorLower)
      )
    }

    // Calculate match scores
    const withScores = filtered.map((tx) => ({
      ...tx,
      _matchScore: editingLineItem ? scoreTransactionCandidate(editingLineItem, tx).confidence : 0,
    }))

    // Sort based on selected column and direction
    const multiplier = sortDirection === 'asc' ? 1 : -1
    withScores.sort((a, b) => {
      switch (sortColumn) {
        case 'match':
          return ((a._matchScore ?? 0) - (b._matchScore ?? 0)) * multiplier
        case 'date':
          return a.date.localeCompare(b.date) * multiplier
        case 'amount':
          return (Math.abs(a.amount_agorot) - Math.abs(b.amount_agorot)) * multiplier
        case 'description':
          return a.description.localeCompare(b.description) * multiplier
        default:
          return 0
      }
    })

    return withScores
  }, [candidates, candidateDateFrom, candidateDateTo, candidateSearch, transactionTypeFilter, editingLineItem, sortColumn, sortDirection, amountTolerance, currencyFilter, selectedCardIds, vendorFilter])

  const handleEditRow = (rowId: string, type: 'line-item' | 'doc-link' | 'new-doc-link') => {
    if (editingRowId === rowId && editingRowType === type) {
      setEditingRowId(null)
      setEditingRowType(null)
      setCandidateSearch('')
      setCandidateDateFrom('')
      setCandidateDateTo('')
      setTransactionTypeFilter('all')
      setAmountTolerance(defaultAmountTolerance)
      setCurrencyFilter(defaultCurrency)
      setSelectedCardIds([])
      setVendorFilter('')
    } else {
      setEditingRowId(rowId)
      setEditingRowType(type)
      setCandidateSearch('')
      setTransactionTypeFilter('all')
      // Reset sort to match% descending (best matches first)
      setSortColumn('match')
      setSortDirection('desc')
      // Reset advanced filters to user's configured defaults
      setAmountTolerance(defaultAmountTolerance)
      setCurrencyFilter(defaultCurrency)
      setSelectedCardIds([])
      setVendorFilter('')

      // Pre-populate date range based on line item date (using settings default)
      if (type === 'line-item') {
        const lineItem = lineItems.find((item) => item.id === rowId)
        if (lineItem?.transaction_date) {
          const { from, to } = calculateDateRange(lineItem.transaction_date, defaultDateRangeDays, defaultDateRangeDays)
          setCandidateDateFrom(from)
          setCandidateDateTo(to)
        } else {
          setCandidateDateFrom('')
          setCandidateDateTo('')
        }
      } else {
        setCandidateDateFrom('')
        setCandidateDateTo('')
      }
    }
  }

  const handleCancelEdit = () => {
    setEditingRowId(null)
    setEditingRowType(null)
    setCandidateSearch('')
    setCandidateDateFrom('')
    setCandidateDateTo('')
    setTransactionTypeFilter('all')
    setAmountTolerance(defaultAmountTolerance)
    setCurrencyFilter(defaultCurrency)
    setSelectedCardIds([])
    setVendorFilter('')
  }

  const handleLinkLineItem = async (lineItemId: string, transactionId: string) => {
    setIsLinking(true)
    setError(null)
    try {
      const result = await linkLineItemToTransaction(lineItemId, transactionId, { matchMethod: 'manual' })
      if (!result.success) throw new Error(result.error || 'Failed to link')
      await fetchAllRows()
      onLinkChange?.()
      handleCancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link')
    } finally {
      setIsLinking(false)
    }
  }

  const handleUnlinkLineItem = async (lineItemId: string) => {
    setIsLinking(true)
    setError(null)
    try {
      const result = await unlinkLineItemFromTransaction(lineItemId)
      if (!result.success) throw new Error(result.error || 'Failed to unlink')
      await fetchAllRows()
      onLinkChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink')
    } finally {
      setIsLinking(false)
    }
  }

  const handleAddDocumentLink = async (transactionId: string) => {
    setIsLinking(true)
    setError(null)
    try {
      const { error: insertError } = await supabase.from('invoice_rows').insert({
        invoice_id: invoiceId,
        transaction_id: transactionId,
        is_document_link: true,
        match_status: 'manual',
        match_method: 'manual',
        matched_at: new Date().toISOString(),
      })
      if (insertError) throw insertError
      await fetchAllRows()
      onLinkChange?.()
      handleCancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add document link')
    } finally {
      setIsLinking(false)
    }
  }

  const handleReplaceDocumentLink = async (docLinkId: string, transactionId: string) => {
    setIsLinking(true)
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('invoice_rows')
        .update({ transaction_id: transactionId })
        .eq('id', docLinkId)
      if (updateError) throw updateError
      await fetchAllRows()
      onLinkChange?.()
      handleCancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace document link')
    } finally {
      setIsLinking(false)
    }
  }

  const handleRemoveDocumentLink = async (linkId: string) => {
    setIsLinking(true)
    setError(null)
    try {
      const { error: deleteError } = await supabase
        .from('invoice_rows')
        .delete()
        .eq('id', linkId)
        .eq('is_document_link', true)
      if (deleteError) throw deleteError
      await fetchAllRows()
      onLinkChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove document link')
    } finally {
      setIsLinking(false)
    }
  }

  const handleSelectTransaction = (transactionId: string) => {
    if (!editingRowId || !editingRowType) return
    if (editingRowType === 'line-item') handleLinkLineItem(editingRowId, transactionId)
    else if (editingRowType === 'new-doc-link') handleAddDocumentLink(transactionId)
    else if (editingRowType === 'doc-link') handleReplaceDocumentLink(editingRowId, transactionId)
  }

  const stats = useMemo(() => {
    const total = lineItems.length
    const linked = lineItems.filter((item) => item.transaction_id).length
    const totalAmount = lineItems.reduce((sum, item) => sum + Math.abs(item.total_agorot || 0), 0)
    const linkedAmount = lineItems
      .filter((item) => item.transaction_id)
      .reduce((sum, item) => sum + Math.abs(item.total_agorot || 0), 0)
    return { total, linked, totalAmount, linkedAmount }
  }, [lineItems])

  const handleClose = () => {
    handleCancelEdit()
    setCandidates([])
    setError(null)
    onClose()
  }

  // Check if we're in line item editing mode
  const isEditingLineItem = editingRowType === 'line-item' && editingRowId

  return (
    <Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Modal.Content className="!w-[calc(95vw-4rem)] !h-[calc(90vh-4rem)] !max-w-none overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <Modal.Title>Invoice Bank Links</Modal.Title>
            {vendorName && (
              <span className="text-sm text-text-muted" dir="auto">
                {vendorName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-background/50 rounded-lg">
              <span className="text-text-muted">Items:</span>
              <span className="font-medium text-text">
                {stats.linked}/{stats.total}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-background/50 rounded-lg">
              <span className="text-text-muted">Amount:</span>
              <span className="font-medium text-text">
                {formatCurrency(stats.linkedAmount, 'ILS')} / {formatCurrency(stats.totalAmount, 'ILS')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-text-muted hover:text-text transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="px-3 py-2 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm shrink-0">
            {error}
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* Line Items Section */}
          <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
            {/* Left - Line Items */}
            <Panel defaultSize={40} minSize={25} className="flex flex-col min-h-0">
              <div className="flex-1 flex flex-col min-h-0 border border-text-muted/20 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-surface/50 border-b border-text-muted/20 shrink-0">
                <h3 className="text-sm font-medium text-text">Line Items</h3>
                <p className="text-xs text-text-muted mt-0.5">Invoice line items</p>
              </div>
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center text-text-muted">Loading...</div>
              ) : lineItems.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-text-muted">No line items</div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {/* Header row */}
                  <div className="flex items-center border-b border-text-muted/20 bg-surface/30 text-xs font-medium text-text-muted uppercase tracking-wider min-h-[36px]">
                    <div className="w-10 shrink-0" />
                    <div className="w-20 px-2">Date</div>
                    <div className="flex-1 px-2">Description</div>
                    <div className="w-24 px-2 text-end">Amount</div>
                    <div className="w-28 px-2 truncate" dir="auto">Vendor</div>
                    <div className="w-24 px-2">Invoice #</div>
                  </div>
                  {lineItems.map((item, index) => {
                    const isLinked = !!item.transaction_id
                    const rowNumber = index + 1
                    const isCurrentlyEditing = editingRowId === item.id && editingRowType === 'line-item'
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center border-b border-text-muted/10 min-h-[44px] ${
                          isCurrentlyEditing ? 'bg-primary/10' : ''
                        }`}
                      >
                        <div className="w-10 flex items-center justify-center shrink-0 bg-surface/30">
                          <NumberBadge number={rowNumber} linked={isLinked} />
                        </div>
                        <div className="w-20 px-2 text-sm text-text-muted whitespace-nowrap">
                          {formatDisplayDate(item.transaction_date)}
                        </div>
                        <div className="flex-1 px-2 text-sm text-text truncate" dir="auto">
                          {item.description || '-'}
                        </div>
                        <div className="w-24 px-2 text-sm font-medium text-text text-end whitespace-nowrap">
                          {formatLineItemAmount(item)}
                        </div>
                        <div className="w-28 px-2 text-sm text-text-muted truncate" dir="auto">
                          {vendorName || '-'}
                        </div>
                        <div className="w-24 px-2 text-sm text-text-muted truncate">
                          {invoiceNumber || '-'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              </div>
            </Panel>

            {/* Resize Handle */}
            <PanelResizeHandle className="w-1 mx-2 bg-text-muted/20 hover:bg-primary/50 transition-colors cursor-col-resize group relative">
              <div className="absolute inset-y-0 -left-2 -right-2" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-1 h-1 rounded-full bg-text-muted" />
                <div className="w-1 h-1 rounded-full bg-text-muted" />
                <div className="w-1 h-1 rounded-full bg-text-muted" />
              </div>
            </PanelResizeHandle>

            {/* Right - Bank/CC Transaction */}
            <Panel defaultSize={60} minSize={30} className="flex flex-col min-h-0">
              <div className="flex-1 flex flex-col min-h-0 border border-text-muted/20 rounded-lg overflow-hidden">
              {isEditingLineItem ? (
                // Full panel transaction selector
                <>
                  <div className="px-4 py-3 bg-surface/50 border-b border-text-muted/20 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <NumberBadge number={editingLineItemIndex + 1} />
                        <h3 className="text-sm font-medium text-text">Select Transaction to Link</h3>
                        <span className="text-xs text-text-muted">
                          ({filteredCandidates.length} of {candidates.length} transactions)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-3 py-1 text-xs bg-text-muted/20 text-text-muted rounded hover:bg-text-muted/30 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    {editingLineItem && (
                      <p className="text-xs text-text-muted mt-1" dir="auto">
                        For: {editingLineItem.description || 'No description'} -{' '}
                        {formatLineItemAmount(editingLineItem)}
                      </p>
                    )}
                  </div>

                  {/* Filters */}
                  <div className="px-4 py-3 border-b border-text-muted/20 shrink-0">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Date range picker - pre-populated */}
                      <RangeCalendarCard
                        startDate={candidateDateFrom}
                        endDate={candidateDateTo}
                        onChange={(start, end) => {
                          setCandidateDateFrom(start)
                          setCandidateDateTo(end)
                        }}
                      />

                      {/* Amount tolerance */}
                      <FilterDropdown
                        icon={AdjustmentsHorizontalIcon}
                        label="Tolerance"
                        value={amountTolerance}
                        options={TOLERANCE_OPTIONS}
                        onChange={(val) => setAmountTolerance(val as number)}
                      />

                      {/* Currency filter */}
                      <FilterDropdown
                        icon={CurrencyDollarIcon}
                        label="Currency"
                        value={currencyFilter}
                        options={CURRENCY_OPTIONS}
                        onChange={(val) => setCurrencyFilter(val as string)}
                      />

                      {/* Transaction Type Filter */}
                      <div className="flex items-center gap-1 bg-surface border border-text-muted/20 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => setTransactionTypeFilter('all')}
                          className={`px-2.5 py-1 text-xs rounded transition-colors ${
                            transactionTypeFilter === 'all'
                              ? 'bg-primary/20 text-primary'
                              : 'text-text-muted hover:text-text'
                          }`}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransactionTypeFilter('cc_purchase')}
                          className={`px-2.5 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
                            transactionTypeFilter === 'cc_purchase'
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'text-text-muted hover:text-text'
                          }`}
                        >
                          <CreditCardIcon className="w-3 h-3" />
                          CC
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransactionTypeFilter('bank_regular')}
                          className={`px-2.5 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
                            transactionTypeFilter === 'bank_regular'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'text-text-muted hover:text-text'
                          }`}
                        >
                          <BanknotesIcon className="w-3 h-3" />
                          Bank
                        </button>
                      </div>

                      {/* Card filter - only show for CC or All types */}
                      {transactionTypeFilter !== 'bank_regular' && creditCards.length > 0 && (
                        <CardMultiSelect
                          cards={creditCards}
                          value={selectedCardIds}
                          onChange={setSelectedCardIds}
                        />
                      )}

                      {/* Search */}
                      <div className="relative flex-1 min-w-[200px]">
                        <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="text"
                          value={candidateSearch}
                          onChange={(e) => setCandidateSearch(e.target.value)}
                          placeholder="Search transactions..."
                          className="w-full ps-9 pe-3 py-2 text-sm bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Transaction list */}
                  <div className="flex-1 overflow-y-auto">
                    {isLoadingCandidates ? (
                      <div className="flex items-center justify-center py-8 text-text-muted">Loading...</div>
                    ) : filteredCandidates.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-text-muted">
                        No transactions found
                      </div>
                    ) : (
                      <>
                        {/* Header row */}
                        <div className="flex items-center border-b border-text-muted/20 bg-surface/30 text-xs font-medium text-text-muted uppercase tracking-wider min-h-[36px]">
                          <div className="w-14 px-2">Type</div>
                          <button
                            type="button"
                            onClick={() => handleSort('description')}
                            className="flex-1 px-2 flex items-center gap-1 hover:text-text transition-colors text-start"
                          >
                            Description
                            {sortColumn === 'description' && (
                              sortDirection === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSort('date')}
                            className="w-16 px-2 flex items-center justify-center gap-1 hover:text-text transition-colors"
                          >
                            Date
                            {sortColumn === 'date' && (
                              sortDirection === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSort('amount')}
                            className="w-20 px-2 flex items-center justify-end gap-1 hover:text-text transition-colors"
                          >
                            Amount
                            {sortColumn === 'amount' && (
                              sortDirection === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                            )}
                          </button>
                          <div className="w-10 px-1 text-center">Cur</div>
                          <div className="w-10 px-1 text-center">VAT</div>
                          <div className="w-12 px-1 text-center">VAT%</div>
                          <div className="w-16 px-1 text-end">VAT Amt</div>
                          <button
                            type="button"
                            onClick={() => handleSort('match')}
                            className="w-14 px-1 flex items-center justify-center gap-1 hover:text-text transition-colors"
                          >
                            Match%
                            {sortColumn === 'match' && (
                              sortDirection === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                            )}
                          </button>
                          <div className="w-14 px-1 text-center">Ref</div>
                        </div>
                        <div className="divide-y divide-text-muted/10">
                          {filteredCandidates.map((tx) => {
                            const txHasVat = tx.has_vat ?? false
                            const txVatPercentage = tx.vat_percentage ?? 18
                            const txVatAmount = txHasVat
                              ? calculateVatFromTotal(Math.abs(tx.amount_agorot), txVatPercentage)
                              : null
                            const txCurrency = tx.foreign_currency || 'ILS'

                            return (
                              <button
                                key={tx.id}
                                type="button"
                                onClick={() => handleSelectTransaction(tx.id)}
                                disabled={isLinking}
                                className="w-full flex items-center hover:bg-surface/50 text-start disabled:opacity-50 transition-colors min-h-[44px]"
                              >
                                <div className="w-14 px-2">
                                  <TransactionTypeBadge type={tx.transaction_type} />
                                </div>
                                <div className="flex-1 px-2 text-sm text-text truncate" dir="auto">
                                  {parseDescriptionParts(tx.description).merchantName}
                                </div>
                                <div className="w-16 px-2 text-center text-sm text-text-muted whitespace-nowrap">
                                  {formatDisplayDate(tx.date)}
                                </div>
                                <div className="w-20 px-2 text-end text-sm font-medium text-red-400 whitespace-nowrap">
                                  {formatTransactionAmount(tx)}
                                </div>
                                <div className="w-10 px-1 text-center text-xs text-text-muted">
                                  {txCurrency}
                                </div>
                                <div className="w-10 px-1 text-center">
                                  {txHasVat ? (
                                    <CheckIcon className="w-4 h-4 text-green-400 inline-block" />
                                  ) : (
                                    <XMarkIcon className="w-4 h-4 text-text-muted/30 inline-block" />
                                  )}
                                </div>
                                <div className="w-12 px-1 text-center text-sm text-text-muted">
                                  {txHasVat ? `${txVatPercentage}%` : '-'}
                                </div>
                                <div className="w-16 px-1 text-end text-sm text-text-muted whitespace-nowrap">
                                  {txVatAmount !== null ? formatCurrency(txVatAmount, txCurrency) : '-'}
                                </div>
                                <div className="w-14 px-1 text-center">
                                  {tx._matchScore !== undefined ? (
                                    <span
                                      className={`text-xs font-medium ${
                                        tx._matchScore >= 80
                                          ? 'text-green-400'
                                          : tx._matchScore >= 50
                                            ? 'text-yellow-400'
                                            : 'text-text-muted'
                                      }`}
                                    >
                                      {tx._matchScore}%
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </div>
                                <div className="w-14 px-1 text-center text-xs text-text-muted truncate">
                                  {tx.transaction_type === 'cc_purchase'
                                    ? (tx.credit_card_id ? '****' : '-')
                                    : (tx.reference || '-')}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                // Normal view - row by row
                <>
                  <div className="px-4 py-3 bg-surface/50 border-b border-text-muted/20 shrink-0">
                    <h3 className="text-sm font-medium text-text">Bank/CC Transaction</h3>
                    <p className="text-xs text-text-muted mt-0.5">Click empty slot to link</p>
                  </div>
                  {isLoading ? (
                    <div className="flex-1 flex items-center justify-center text-text-muted">Loading...</div>
                  ) : (
                    <div className="flex-1 overflow-y-auto">
                      {/* Header row */}
                      <div className="flex items-center border-b border-text-muted/20 bg-surface/30 text-xs font-medium text-text-muted uppercase tracking-wider min-h-[36px]">
                        <div className="w-10 shrink-0" />
                        <div className="w-14 px-1">Type</div>
                        <div className="flex-1 px-2">Description</div>
                        <div className="w-16 px-1 text-center">Date</div>
                        <div className="w-20 px-1 text-end">Amount</div>
                        <div className="w-10 px-1 text-center">Cur</div>
                        <div className="w-10 px-1 text-center">VAT</div>
                        <div className="w-12 px-1 text-center">VAT%</div>
                        <div className="w-16 px-1 text-end">VAT Amt</div>
                        <div className="w-16 px-1 text-center">Ref</div>
                        <div className="w-14 px-1" />
                      </div>
                      {lineItems.map((item, index) => {
                        const isLinked = !!item.transaction_id
                        const rowNumber = index + 1
                        const isHovered = hoveredRowId === item.id
                        const tx = item.transaction

                        // Calculate VAT info for the transaction
                        const txHasVat = tx?.has_vat ?? false
                        const txVatPercentage = tx?.vat_percentage ?? 18
                        const txVatAmount = tx && txHasVat
                          ? calculateVatFromTotal(Math.abs(tx.amount_agorot), txVatPercentage)
                          : null
                        const txCurrency = tx?.foreign_currency || 'ILS'

                        return (
                          <div
                            key={item.id}
                            className="flex items-center border-b border-text-muted/10 min-h-[44px]"
                            onMouseEnter={() => setHoveredRowId(item.id)}
                            onMouseLeave={() => setHoveredRowId(null)}
                          >
                            <div className="w-10 flex items-center justify-center shrink-0 bg-surface/30">
                              <NumberBadge number={rowNumber} linked={isLinked} />
                            </div>
                            {isLinked && tx ? (
                              <>
                                <div className="w-14 px-1">
                                  <TransactionTypeBadge type={tx.transaction_type} />
                                </div>
                                <div className="flex-1 px-2 text-sm text-text truncate" dir="auto">
                                  {parseDescriptionParts(tx.description).merchantName}
                                </div>
                                <div className="w-16 px-1 text-center text-sm text-text-muted whitespace-nowrap">
                                  {formatDisplayDate(tx.date)}
                                </div>
                                <div className="w-20 px-1 text-end text-sm font-medium text-red-400 whitespace-nowrap">
                                  {formatTransactionAmount(tx)}
                                </div>
                                <div className="w-10 px-1 text-center text-xs text-text-muted">
                                  {txCurrency}
                                </div>
                                <div className="w-10 px-1 text-center">
                                  {txHasVat ? (
                                    <CheckIcon className="w-4 h-4 text-green-400 inline-block" />
                                  ) : (
                                    <XMarkIcon className="w-4 h-4 text-text-muted/30 inline-block" />
                                  )}
                                </div>
                                <div className="w-12 px-1 text-center text-sm text-text-muted">
                                  {txHasVat ? `${txVatPercentage}%` : '-'}
                                </div>
                                <div className="w-16 px-1 text-end text-sm text-text-muted whitespace-nowrap">
                                  {txVatAmount !== null ? formatCurrency(txVatAmount, txCurrency) : '-'}
                                </div>
                                <div className="w-16 px-1 text-center text-xs text-text-muted truncate">
                                  {tx.transaction_type === 'cc_purchase'
                                    ? (tx.credit_card_id ? '****' : '-')
                                    : (tx.reference || '-')}
                                </div>
                                <div
                                  className={`w-14 px-1 flex items-center justify-end gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleEditRow(item.id, 'line-item')}
                                    className="p-1 bg-primary/20 text-primary rounded hover:bg-primary/30"
                                    title="Change"
                                  >
                                    <ArrowPathIcon className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUnlinkLineItem(item.id)}
                                    disabled={isLinking}
                                    className="p-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 disabled:opacity-50"
                                    title="Unlink"
                                  >
                                    <TrashIcon className="w-3 h-3" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="flex-1 flex items-center px-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditRow(item.id, 'line-item')}
                                  className="w-full h-full min-h-[28px] border border-dashed border-text-muted/30 rounded flex items-center justify-center hover:border-primary/50 hover:bg-primary/5 transition-colors"
                                >
                                  <span className="text-xs text-text-muted">Click to select transaction</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
              </div>
            </Panel>
          </PanelGroup>

          {/* Document Links Section - Bottom */}
          <div className="shrink-0 flex gap-4">
            {/* Left - Document Links Labels */}
            <div className="flex-1 border border-text-muted/20 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-surface/50 border-b border-text-muted/20 flex items-center justify-between">
                <h3 className="text-sm font-medium text-text flex items-center gap-2">
                  <DocumentIcon className="w-4 h-4" />
                  Document Links
                </h3>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {documentLinks.map((link, index) => (
                  <div
                    key={link.id}
                    className={`flex items-stretch border-b border-text-muted/10 min-h-[44px] ${
                      editingRowId === link.id && editingRowType === 'doc-link' ? 'bg-primary/10' : ''
                    }`}
                  >
                    <div className="w-10 flex items-center justify-center shrink-0 bg-surface/30">
                      <NumberBadge number={`D${index + 1}`} linked={!!link.transaction_id} isDoc />
                    </div>
                    <div className="flex-1 flex items-center px-3 py-2">
                      <span className="text-sm text-text-muted">Document-level link</span>
                    </div>
                  </div>
                ))}
                {/* Empty slot for new */}
                <div
                  className={`flex items-stretch border-b border-text-muted/10 min-h-[44px] ${
                    editingRowId === 'new-doc-link' && editingRowType === 'new-doc-link' ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="w-10 flex items-center justify-center shrink-0 bg-surface/30">
                    <NumberBadge number={`D${documentLinks.length + 1}`} isDoc />
                  </div>
                  <div className="flex-1 flex items-center px-3 py-2">
                    <span className="text-sm text-text-muted opacity-50">New document link</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right - Document Links Transactions */}
            <div className="flex-1 border border-text-muted/20 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-surface/50 border-b border-text-muted/20 flex items-center justify-between">
                <h3 className="text-sm font-medium text-text flex items-center gap-2">
                  <DocumentIcon className="w-4 h-4" />
                  Document Links
                </h3>
                <button
                  type="button"
                  onClick={() => handleEditRow('new-doc-link', 'new-doc-link')}
                  className="p-1 bg-primary/20 text-primary rounded hover:bg-primary/30 transition-colors"
                  title="Add document link"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {documentLinks.map((link, index) => {
                  const isEditing = editingRowId === link.id && editingRowType === 'doc-link'
                  const isHovered = hoveredRowId === `doc-${link.id}`

                  return (
                    <div
                      key={link.id}
                      className="flex items-stretch border-b border-text-muted/10 min-h-[44px]"
                      onMouseEnter={() => setHoveredRowId(`doc-${link.id}`)}
                      onMouseLeave={() => setHoveredRowId(null)}
                    >
                      <div className="w-10 flex items-center justify-center shrink-0 bg-surface/30">
                        <NumberBadge number={`D${index + 1}`} linked={!!link.transaction_id} isDoc />
                      </div>
                      <div className="flex-1 px-3 py-2">
                        {isEditing ? (
                          <div className="space-y-2 p-2 bg-surface/30 rounded border border-text-muted/20">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-text-muted">Select Transaction</span>
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="text-xs text-text-muted hover:text-text"
                              >
                                Cancel
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <MagnifyingGlassIcon className="absolute start-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                                <input
                                  type="text"
                                  value={candidateSearch}
                                  onChange={(e) => setCandidateSearch(e.target.value)}
                                  placeholder="Search..."
                                  className="w-full ps-7 pe-2 py-1 text-xs bg-surface border border-text-muted/20 rounded text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50"
                                />
                              </div>
                            </div>
                            <div className="max-h-[120px] overflow-y-auto border border-text-muted/20 rounded bg-background/50">
                              {isLoadingCandidates ? (
                                <div className="p-3 text-center text-text-muted text-xs">Loading...</div>
                              ) : filteredCandidates.length === 0 ? (
                                <div className="p-3 text-center text-text-muted text-xs">No transactions</div>
                              ) : (
                                <div className="divide-y divide-text-muted/10">
                                  {filteredCandidates.map((tx) => (
                                    <button
                                      key={tx.id}
                                      type="button"
                                      onClick={() => handleSelectTransaction(tx.id)}
                                      disabled={isLinking}
                                      className="w-full px-2 py-1.5 flex items-center gap-2 hover:bg-surface/50 text-start disabled:opacity-50"
                                    >
                                      <TransactionTypeBadge type={tx.transaction_type} />
                                      <span className="text-xs text-text truncate flex-1" dir="auto">
                                        {tx.description}
                                      </span>
                                      <span className="text-xs font-medium text-text">
                                        {formatTransactionAmount(tx)}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : link.transaction ? (
                          <div className="flex items-center gap-2 h-full">
                            <TransactionTypeBadge type={link.transaction.transaction_type} />
                            <span className="text-xs text-text-muted whitespace-nowrap">
                              {formatDisplayDate(link.transaction.date)}
                            </span>
                            <span className="text-sm text-text truncate flex-1" dir="auto">
                              {link.transaction.description}
                            </span>
                            <span className="text-sm font-medium text-text whitespace-nowrap">
                              {formatTransactionAmount(link.transaction)}
                            </span>
                            <div
                              className={`flex items-center gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}
                            >
                              <button
                                type="button"
                                onClick={() => handleEditRow(link.id, 'doc-link')}
                                className="p-1 bg-primary/20 text-primary rounded hover:bg-primary/30"
                                title="Change"
                              >
                                <ArrowPathIcon className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveDocumentLink(link.id)}
                                disabled={isLinking}
                                className="p-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 disabled:opacity-50"
                                title="Remove"
                              >
                                <TrashIcon className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">No transaction</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {/* Empty slot for new document link */}
                <div className="flex items-stretch border-b border-text-muted/10 min-h-[44px]">
                  <div className="w-10 flex items-center justify-center shrink-0 bg-surface/30">
                    <NumberBadge number={`D${documentLinks.length + 1}`} isDoc />
                  </div>
                  <div className="flex-1 px-3 py-2">
                    {editingRowId === 'new-doc-link' && editingRowType === 'new-doc-link' ? (
                      <div className="space-y-2 p-2 bg-surface/30 rounded border border-text-muted/20">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-text-muted">Select Transaction</span>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="text-xs text-text-muted hover:text-text"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <MagnifyingGlassIcon className="absolute start-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                            <input
                              type="text"
                              value={candidateSearch}
                              onChange={(e) => setCandidateSearch(e.target.value)}
                              placeholder="Search..."
                              className="w-full ps-7 pe-2 py-1 text-xs bg-surface border border-text-muted/20 rounded text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50"
                            />
                          </div>
                        </div>
                        <div className="max-h-[120px] overflow-y-auto border border-text-muted/20 rounded bg-background/50">
                          {isLoadingCandidates ? (
                            <div className="p-3 text-center text-text-muted text-xs">Loading...</div>
                          ) : filteredCandidates.length === 0 ? (
                            <div className="p-3 text-center text-text-muted text-xs">No transactions</div>
                          ) : (
                            <div className="divide-y divide-text-muted/10">
                              {filteredCandidates.map((tx) => (
                                <button
                                  key={tx.id}
                                  type="button"
                                  onClick={() => handleSelectTransaction(tx.id)}
                                  disabled={isLinking}
                                  className="w-full px-2 py-1.5 flex items-center gap-2 hover:bg-surface/50 text-start disabled:opacity-50"
                                >
                                  <TransactionTypeBadge type={tx.transaction_type} />
                                  <span className="text-xs text-text truncate flex-1" dir="auto">
                                    {tx.description}
                                  </span>
                                  <span className="text-xs font-medium text-text">
                                    {formatTransactionAmount(tx)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleEditRow('new-doc-link', 'new-doc-link')}
                        className="w-full h-full min-h-[28px] border border-dashed border-text-muted/30 rounded flex items-center justify-center hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      >
                        <span className="text-xs text-text-muted">Click to add document link</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal.Content>
    </Modal.Overlay>
  )
}
