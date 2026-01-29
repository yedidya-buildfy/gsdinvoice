import { useMemo, useState, useEffect } from 'react'
import { XMarkIcon, CalendarDaysIcon, CurrencyDollarIcon, CreditCardIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Modal } from '@/components/ui/base/modal/modal'
import {
  useCCBankMatchResults,
  useUnmatchCCTransactions,
  useCCTransactions,
  useAttachCCTransactions,
  type CCTransactionDisplay
} from '@/hooks/useCCBankMatchResults'
import { useCreditCards } from '@/hooks/useCreditCards'
import { formatShekel } from '@/lib/utils/currency'
import { supabase } from '@/lib/supabase'
import { RangeCalendarCard } from '@/components/ui/date-picker'
import type { Transaction, CreditCard } from '@/types/database'

// Format amount with correct currency (foreign if available, otherwise ILS)
function formatDisplayAmount(tx: CCTransactionDisplay): string {
  if (tx.foreign_amount_cents !== null && tx.foreign_currency) {
    const amount = Math.abs(tx.foreign_amount_cents) / 100
    const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return `${formatted} ${tx.foreign_currency}`
  }
  return formatShekel(tx.amount_agorot)
}

// Card multi-select component (same pattern as CreditCardPage)
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
        className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-text-muted/20 rounded-lg text-text hover:border-text-muted/40 transition-colors text-xs"
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
        {/* All option */}
        <label className="flex items-center gap-2 px-3 py-2 hover:bg-background/50 cursor-pointer text-sm border-b border-text-muted/10">
          <input
            type="checkbox"
            checked={value.length === 0}
            onChange={() => onChange([])}
            className="checkbox-dark"
          />
          <span className="text-text font-medium">All Cards</span>
        </label>
        {/* Individual cards */}
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

interface CCChargeModalProps {
  isOpen: boolean
  onClose: () => void
  bankTransactionId: string | null
  // Optional: when set, modal shows bank charge selection mode for linking this CC transaction
  ccTransactionIdToLink?: string | null
}

// Checkbox styling
const checkboxClass = 'checkbox-dark'

export function CCChargeModal({ isOpen, onClose, bankTransactionId, ccTransactionIdToLink }: CCChargeModalProps) {
  const { matchResults, isLoading, refetch } = useCCBankMatchResults()
  const { unmatch, isUnmatching } = useUnmatchCCTransactions()
  const { attach, isAttaching } = useAttachCCTransactions()
  const { creditCards } = useCreditCards()

  // Bank transaction state (fetched directly for empty state)
  const [bankTransaction, setBankTransaction] = useState<Transaction | null>(null)
  const [isFetchingBank, setIsFetchingBank] = useState(false)

  // Bank CC charges for linking mode
  const [bankCCCharges, setBankCCCharges] = useState<Transaction[]>([])
  const [isFetchingCharges, setIsFetchingCharges] = useState(false)

  // Link mode filters
  const [linkSearch, setLinkSearch] = useState('')
  const [linkFromDate, setLinkFromDate] = useState('')
  const [linkToDate, setLinkToDate] = useState('')
  const [linkSelectedCardIds, setLinkSelectedCardIds] = useState<string[]>([])

  // Mode: 'details' = show bank charge details, 'link' = select bank charge to link CC transaction
  const isLinkMode = !!ccTransactionIdToLink && !bankTransactionId

  // Selected IDs for disconnect
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Connected section filters
  const [connectedFromDate, setConnectedFromDate] = useState('')
  const [connectedToDate, setConnectedToDate] = useState('')
  const [connectedDateField, setConnectedDateField] = useState<'transaction_date' | 'charge_date'>('transaction_date')
  const [connectedSearch, setConnectedSearch] = useState('')
  const [connectedSelectedCardIds, setConnectedSelectedCardIds] = useState<string[]>([])

  // Attach section state
  const [attachFromDate, setAttachFromDate] = useState('')
  const [attachToDate, setAttachToDate] = useState('')
  const [attachSelectedIds, setAttachSelectedIds] = useState<Set<string>>(new Set())
  const [attachDateField, setAttachDateField] = useState<'transaction_date' | 'charge_date'>('transaction_date')
  const [attachConnectionStatus, setAttachConnectionStatus] = useState<'all' | 'connected' | 'not_connected'>('not_connected')
  const [attachSearch, setAttachSearch] = useState('')
  const [attachSelectedCardIds, setAttachSelectedCardIds] = useState<string[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)

  // Clear selection when connected filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [connectedSelectedCardIds, connectedFromDate, connectedToDate, connectedDateField, connectedSearch])

  // Clear selection when attach filters change
  useEffect(() => {
    setAttachSelectedIds(new Set())
  }, [attachSelectedCardIds, attachFromDate, attachToDate, attachDateField, attachConnectionStatus, attachSearch])

  // Fetch bank transaction when modal opens (details mode)
  useEffect(() => {
    if (!isOpen || !bankTransactionId) {
      setBankTransaction(null)
      return
    }

    async function fetchBankTx() {
      if (!bankTransactionId) return
      setIsFetchingBank(true)

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', bankTransactionId)
        .single()

      if (!error && data) {
        setBankTransaction(data)
      }
      setIsFetchingBank(false)
    }

    fetchBankTx()
  }, [isOpen, bankTransactionId])

  // Fetch bank CC charges when in link mode
  useEffect(() => {
    if (!isOpen || !isLinkMode) {
      setBankCCCharges([])
      return
    }

    async function fetchBankCCCharges() {
      setIsFetchingCharges(true)
      // NEW SCHEMA: Use transaction_type = 'bank_cc_charge' instead of is_credit_card_charge
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('transaction_type', 'bank_cc_charge')
        .order('date', { ascending: false })

      if (!error && data) {
        setBankCCCharges(data)
      }
      setIsFetchingCharges(false)
    }

    fetchBankCCCharges()
  }, [isOpen, isLinkMode])

  // Filter bank CC charges for link mode
  const filteredBankCCCharges = useMemo(() => {
    let filtered = bankCCCharges

    // Filter by date range
    if (linkFromDate || linkToDate) {
      filtered = filtered.filter(charge => {
        if (!charge.date) return false
        if (linkFromDate && charge.date < linkFromDate) return false
        if (linkToDate && charge.date > linkToDate) return false
        return true
      })
    }

    // Filter by card (match card last 4 digits in description or linked credit_card_id)
    if (linkSelectedCardIds.length > 0) {
      const selectedCards = creditCards.filter(c => linkSelectedCardIds.includes(c.id))
      filtered = filtered.filter(charge => {
        // Check if charge has credit_card_id that matches
        if (charge.credit_card_id && linkSelectedCardIds.includes(charge.credit_card_id)) {
          return true
        }
        // Check if description contains any of the selected cards' last 4 digits
        return selectedCards.some(card =>
          card.card_last_four && charge.description?.includes(card.card_last_four)
        )
      })
    }

    // Filter by search
    if (linkSearch.trim()) {
      const searchLower = linkSearch.toLowerCase()
      filtered = filtered.filter(charge =>
        charge.description?.toLowerCase().includes(searchLower)
      )
    }

    return filtered
  }, [bankCCCharges, linkFromDate, linkToDate, linkSelectedCardIds, linkSearch, creditCards])

  // Fetch CC transactions for attach with flexible filters
  const { transactions: ccTxsFromDb, isLoading: isLoadingCCTxs } = useCCTransactions({
    fromDate: attachFromDate || undefined,
    toDate: attachToDate || undefined,
    dateField: attachDateField,
    connectionStatus: attachConnectionStatus,
    cardIds: attachSelectedCardIds.length > 0 ? attachSelectedCardIds : undefined,
  })

  // Filter by search term
  const filteredCCTxs = useMemo(() => {
    if (!attachSearch.trim()) return ccTxsFromDb
    const searchLower = attachSearch.toLowerCase()
    return ccTxsFromDb.filter(tx =>
      tx.merchant_name?.toLowerCase().includes(searchLower)
    )
  }, [ccTxsFromDb, attachSearch])

  // Find the match result for this bank transaction
  const matchResult = useMemo(() => {
    if (!bankTransactionId) return null
    return matchResults.find((r) => r.bank_transaction_id === bankTransactionId) || null
  }, [matchResults, bankTransactionId])

  // Filter connected CC transactions
  const filteredConnectedTxs = useMemo(() => {
    if (!matchResult?.cc_transactions.length) return []

    let filtered = matchResult.cc_transactions

    // Filter by date range
    if (connectedFromDate || connectedToDate) {
      filtered = filtered.filter(tx => {
        const dateToCheck = connectedDateField === 'transaction_date' ? tx.transaction_date : tx.charge_date
        if (!dateToCheck) return false
        if (connectedFromDate && dateToCheck < connectedFromDate) return false
        if (connectedToDate && dateToCheck > connectedToDate) return false
        return true
      })
    }

    // Filter by card
    if (connectedSelectedCardIds.length > 0) {
      filtered = filtered.filter(tx => tx.credit_card_id && connectedSelectedCardIds.includes(tx.credit_card_id))
    }

    // Filter by search
    if (connectedSearch.trim()) {
      const searchLower = connectedSearch.toLowerCase()
      filtered = filtered.filter(tx => tx.merchant_name?.toLowerCase().includes(searchLower))
    }

    return filtered
  }, [matchResult, connectedFromDate, connectedToDate, connectedDateField, connectedSelectedCardIds, connectedSearch])

  // Check if all connected are selected
  const allConnectedSelected = filteredConnectedTxs.length > 0 && filteredConnectedTxs.every(tx => selectedIds.has(tx.id))
  const someConnectedSelected = filteredConnectedTxs.some(tx => selectedIds.has(tx.id))

  // Toggle all connected transactions
  const handleToggleAllConnected = () => {
    if (allConnectedSelected) {
      const newSelection = new Set(selectedIds)
      filteredConnectedTxs.forEach(tx => newSelection.delete(tx.id))
      setSelectedIds(newSelection)
    } else {
      const newSelection = new Set(selectedIds)
      filteredConnectedTxs.forEach(tx => newSelection.add(tx.id))
      setSelectedIds(newSelection)
    }
  }

  // Calculate date range from CC transactions
  const dateRange = useMemo(() => {
    if (!matchResult?.cc_transactions.length) return null

    const dates = matchResult.cc_transactions
      .map((tx) => new Date(tx.transaction_date))
      .sort((a, b) => a.getTime() - b.getTime())

    const earliest = dates[0]
    const latest = dates[dates.length - 1]

    const formatDate = (date: Date) =>
      date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })

    if (earliest.getTime() === latest.getTime()) {
      return formatDate(earliest)
    }

    return `${formatDate(earliest)} - ${formatDate(latest)}`
  }, [matchResult])

  // Get amounts for KPIs
  const bankAmount = matchResult?.bank_amount_agorot ?? bankTransaction?.amount_agorot ?? 0
  const ccAmount = matchResult?.total_cc_amount_agorot ?? 0
  const ccCount = matchResult?.cc_transaction_count ?? 0

  // Calculate match percentage
  const matchPercentage = useMemo(() => {
    if (bankAmount === 0) return 0
    return Math.round((ccAmount / Math.abs(bankAmount)) * 100)
  }, [ccAmount, bankAmount])

  // Toggle selection for disconnect
  const handleToggleSelect = (id: string) => {
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedIds(newSelection)
  }

  // Toggle selection for attach
  const handleToggleAttachSelect = (id: string) => {
    const newSelection = new Set(attachSelectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setAttachSelectedIds(newSelection)
  }

  // Get selectable transactions (not already connected)
  const selectableCCTxs = useMemo(() => {
    return filteredCCTxs.filter(tx => !tx.bank_transaction_id)
  }, [filteredCCTxs])

  // Check if all selectable are selected
  const allSelectableSelected = selectableCCTxs.length > 0 && selectableCCTxs.every(tx => attachSelectedIds.has(tx.id))
  const someSelectableSelected = selectableCCTxs.some(tx => attachSelectedIds.has(tx.id))

  // Toggle all selectable transactions
  const handleToggleAllAttach = () => {
    if (allSelectableSelected) {
      // Deselect all
      const newSelection = new Set(attachSelectedIds)
      selectableCCTxs.forEach(tx => newSelection.delete(tx.id))
      setAttachSelectedIds(newSelection)
    } else {
      // Select all selectable
      const newSelection = new Set(attachSelectedIds)
      selectableCCTxs.forEach(tx => newSelection.add(tx.id))
      setAttachSelectedIds(newSelection)
    }
  }

  // Handle disconnect
  const handleDisconnect = async () => {
    if (!matchResult || selectedIds.size === 0) return
    await unmatch(matchResult.id, Array.from(selectedIds))
    setSelectedIds(new Set())
    refetch()
  }

  // Handle attach
  const handleAttach = async () => {
    if (!bankTransactionId || attachSelectedIds.size === 0) return
    setAttachError(null)
    try {
      await attach(bankTransactionId, Array.from(attachSelectedIds))
      setAttachSelectedIds(new Set())
      refetch()
    } catch (err) {
      console.error('Failed to attach CC transactions:', err)
      setAttachError(err instanceof Error ? err.message : 'Failed to attach transactions')
    }
  }

  // Handle linking CC transaction to a bank charge (link mode)
  const handleLinkToBankCharge = async (selectedBankTxId: string) => {
    if (!ccTransactionIdToLink) return
    setAttachError(null)
    try {
      await attach(selectedBankTxId, [ccTransactionIdToLink])
      refetch()
      onClose()
    } catch (err) {
      console.error('Failed to link CC transaction:', err)
      setAttachError(err instanceof Error ? err.message : 'Failed to link transaction')
    }
  }

  // Reset state when modal closes
  const handleClose = () => {
    setSelectedIds(new Set())
    // Reset connected section
    setConnectedFromDate('')
    setConnectedToDate('')
    setConnectedDateField('transaction_date')
    setConnectedSearch('')
    setConnectedSelectedCardIds([])
    // Reset attach section
    setAttachFromDate('')
    setAttachToDate('')
    setAttachSelectedIds(new Set())
    setAttachDateField('transaction_date')
    setAttachConnectionStatus('not_connected')
    setAttachSearch('')
    setAttachSelectedCardIds([])
    setBankCCCharges([])
    setAttachError(null)
    // Reset link mode filters
    setLinkSearch('')
    setLinkFromDate('')
    setLinkToDate('')
    setLinkSelectedCardIds([])
    onClose()
  }

  return (
    <Modal.Overlay isOpen={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Modal.Content className="!w-[calc(97vw-4rem)] !h-[calc(92vh-4rem)] !max-w-none overflow-y-auto">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Modal.Title>
              {isLinkMode ? 'Link to Bank Charge' : 'Credit Card Charge Details'}
            </Modal.Title>
            {!isLinkMode && bankTransaction && (() => {
              // Try to find card info from:
              // 1. matchResult.card_last_four
              // 2. linked_credit_card_id on bank transaction
              // 3. Match description with card last 4 digits
              let matchedCard = null as typeof creditCards[0] | null

              if (matchResult?.card_last_four) {
                matchedCard = creditCards.find(c => c.card_last_four === matchResult.card_last_four) || null
              }

              if (!matchedCard && bankTransaction.credit_card_id) {
                matchedCard = creditCards.find(c => c.id === bankTransaction.credit_card_id) || null
              }

              if (!matchedCard && bankTransaction.description) {
                // Try to match last 4 digits in description
                matchedCard = creditCards.find(c =>
                  c.card_last_four && bankTransaction.description.includes(c.card_last_four)
                ) || null
              }

              const cardName = matchedCard?.card_name
              const cardLastFour = matchedCard?.card_last_four

              return (
                <span className="text-sm text-text-muted" dir="ltr">
                  {cardName && <span dir="auto">{cardName}</span>}
                  {cardName && ' '}
                  {cardLastFour && `-${cardLastFour}`}
                  {(cardName || cardLastFour) && ' - '}
                  {new Date(bankTransaction.date).toLocaleDateString('he-IL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                  })}
                </span>
              )
            })()}
          </div>

          {/* KPIs inline with header - fill remaining width */}
          {!isLinkMode && (bankTransaction || matchResult) && (
            <div className="flex-1 flex items-center justify-end gap-3 text-sm">
              <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-background/50 border border-text-muted/20 rounded-lg">
                <CalendarDaysIcon className="w-4 h-4 text-text-muted" />
                <span className="text-text-muted">Range:</span>
                <span className="font-medium text-text">{dateRange || '-'}</span>
              </div>
              <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-background/50 border border-text-muted/20 rounded-lg">
                <CurrencyDollarIcon className="w-4 h-4 text-text-muted" />
                <span className="text-text-muted">Match:</span>
                <span className="font-medium text-text">{formatShekel(ccAmount)} / {formatShekel(Math.abs(bankAmount))}</span>
                <span className="text-text-muted">({matchPercentage}%)</span>
              </div>
              <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-background/50 border border-text-muted/20 rounded-lg">
                <CreditCardIcon className="w-4 h-4 text-text-muted" />
                <span className="text-text-muted">Transactions:</span>
                <span className="font-medium text-text">{ccCount}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="text-text-muted hover:text-text transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Link Mode: Show bank CC charges to select from */}
        {isLinkMode ? (
          isFetchingCharges ? (
            <div className="text-center py-8 text-text-muted">Loading bank charges...</div>
          ) : bankCCCharges.length === 0 ? (
            <div className="text-center py-8 text-text-muted">No bank CC charges found</div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-muted">
                Select a bank charge to link this CC transaction to:
              </p>

              {/* Filter controls */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Date picker */}
                <RangeCalendarCard
                  startDate={linkFromDate}
                  endDate={linkToDate}
                  onChange={(start, end) => {
                    setLinkFromDate(start)
                    setLinkToDate(end)
                  }}
                />

                {/* Card filter */}
                {creditCards.length > 0 && (
                  <CardMultiSelect
                    cards={creditCards}
                    value={linkSelectedCardIds}
                    onChange={setLinkSelectedCardIds}
                  />
                )}

                {/* Search bar */}
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <div className="relative flex-1">
                    <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      type="text"
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      placeholder="Search description..."
                      className="w-full ps-9 pe-3 py-1.5 text-sm bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>

              {/* Results */}
              {filteredBankCCCharges.length === 0 ? (
                <div className="text-center py-4 text-text-muted text-sm">
                  No bank charges match the filters
                </div>
              ) : (
              <div className="max-h-96 overflow-y-auto border border-text-muted/20 rounded-lg">
                {filteredBankCCCharges.map((charge) => (
                  <button
                    key={charge.id}
                    onClick={() => handleLinkToBankCharge(charge.id)}
                    disabled={isAttaching}
                    className="w-full flex items-center justify-between p-3 hover:bg-surface/50 transition-colors border-b border-text-muted/10 last:border-b-0 text-start disabled:opacity-50"
                  >
                    <div>
                      <div className="text-sm text-text font-medium" dir="auto">
                        {charge.description}
                      </div>
                      <div className="text-xs text-text-muted">
                        {new Date(charge.date).toLocaleDateString('he-IL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="text-sm text-red-400 font-medium">
                      {formatShekel(charge.amount_agorot)}
                    </div>
                  </button>
                ))}
              </div>
              )}
            </div>
          )
        ) : isLoading || isFetchingBank ? (
          <div className="text-center py-8 text-text-muted">Loading...</div>
        ) : !bankTransaction && !matchResult ? (
          <div className="text-center py-8 text-text-muted">Bank transaction not found</div>
        ) : (
          <>
            {/* Connected CC Transactions section - only show if there are linked transactions */}
            {matchResult && matchResult.cc_transactions.length > 0 && (
              <div className="mb-4 space-y-4">
                <div className="text-sm font-medium text-text">Connected Transactions</div>

                {/* Filter controls */}
                <div className="flex flex-wrap items-center gap-4">
                  {/* Date picker */}
                  <RangeCalendarCard
                    startDate={connectedFromDate}
                    endDate={connectedToDate}
                    onChange={(start, end) => {
                      setConnectedFromDate(start)
                      setConnectedToDate(end)
                    }}
                  />

                  {/* Card filter */}
                  {creditCards.length > 0 && (
                    <CardMultiSelect
                      cards={creditCards}
                      value={connectedSelectedCardIds}
                      onChange={setConnectedSelectedCardIds}
                    />
                  )}

                  {/* Date field toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">Filter by:</span>
                    <div className="flex rounded-lg border border-text-muted/20 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setConnectedDateField('transaction_date')}
                        className={`px-3 py-1.5 text-xs transition-colors ${
                          connectedDateField === 'transaction_date'
                            ? 'bg-primary/20 text-primary'
                            : 'text-text-muted hover:bg-surface/50'
                        }`}
                      >
                        Purchase Date
                      </button>
                      <button
                        type="button"
                        onClick={() => setConnectedDateField('charge_date')}
                        className={`px-3 py-1.5 text-xs transition-colors border-s border-text-muted/20 ${
                          connectedDateField === 'charge_date'
                            ? 'bg-primary/20 text-primary'
                            : 'text-text-muted hover:bg-surface/50'
                        }`}
                      >
                        Billing Date
                      </button>
                    </div>
                  </div>

                  {/* Search bar */}
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <div className="relative flex-1">
                      <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type="text"
                        value={connectedSearch}
                        onChange={(e) => setConnectedSearch(e.target.value)}
                        placeholder="Search merchant..."
                        className="w-full ps-9 pe-3 py-1.5 text-sm bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>

                  {/* Disconnect button */}
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={isUnmatching || selectedIds.size === 0}
                    className="px-4 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                  >
                    {isUnmatching ? 'Disconnecting...' : `Disconnect Selected (${selectedIds.size})`}
                  </button>
                </div>

                {/* Connected transactions table */}
                {filteredConnectedTxs.length === 0 ? (
                  <div className="text-center py-4 text-text-muted text-sm">
                    No transactions match the filters
                  </div>
                ) : (
                  <div className="max-h-[200px] overflow-y-auto border border-text-muted/20 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-surface">
                        <tr className="border-b border-text-muted/20">
                          <th className="text-center py-2 px-2 w-10">
                            <input
                              type="checkbox"
                              checked={allConnectedSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someConnectedSelected && !allConnectedSelected
                              }}
                              onChange={handleToggleAllConnected}
                              className={checkboxClass}
                              disabled={filteredConnectedTxs.length === 0}
                            />
                          </th>
                          <th className="text-start py-2 px-2 text-text-muted font-medium">Purchase</th>
                          <th className="text-start py-2 px-2 text-text-muted font-medium">Billing</th>
                          <th className="text-start py-2 px-2 text-text-muted font-medium">Card</th>
                          <th className="text-start py-2 px-2 text-text-muted font-medium">Merchant</th>
                          <th className="text-end py-2 px-2 text-text-muted font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredConnectedTxs.map((tx) => (
                          <tr key={tx.id} className="border-b border-text-muted/10 hover:bg-background/30">
                            <td className="py-2 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(tx.id)}
                                onChange={() => handleToggleSelect(tx.id)}
                                className={checkboxClass}
                              />
                            </td>
                            <td className="py-2 px-2 text-text">
                              {new Date(tx.transaction_date).toLocaleDateString('he-IL', {
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </td>
                            <td className="py-2 px-2 text-text">
                              {tx.charge_date ? new Date(tx.charge_date).toLocaleDateString('he-IL', {
                                day: '2-digit',
                                month: '2-digit',
                              }) : '-'}
                            </td>
                            <td className="py-2 px-2 text-text text-xs whitespace-nowrap">
                              {tx.card_name && <span dir="auto">{tx.card_name}</span>}
                              {tx.card_name && tx.card_last_four && ' '}
                              {tx.card_last_four && `-${tx.card_last_four}`}
                              {!tx.card_name && !tx.card_last_four && '-'}
                            </td>
                            <td className="py-2 px-2 text-text" dir="auto">
                              {tx.merchant_name || '-'}
                            </td>
                            <td className="py-2 px-2 text-text text-end whitespace-nowrap">
                              {tx.foreign_amount_cents !== null && tx.foreign_currency
                                ? `${(Math.abs(tx.foreign_amount_cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tx.foreign_currency}`
                                : formatShekel(tx.amount_agorot)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Empty state message */}
            {(!matchResult || matchResult.cc_transactions.length === 0) && (
              <div className="text-center py-4 text-text-muted text-sm mb-4">
                No CC transactions linked yet
              </div>
            )}

            {/* Attach Transactions section - always visible */}
            <div className="border-t border-text-muted/20 pt-4 flex-1 flex flex-col min-h-0">
              <div className="text-sm font-medium text-text mb-4">Attach Transactions</div>

              <div className="flex-1 flex flex-col min-h-0 space-y-4">
                  {/* Filter controls */}
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Date picker */}
                    <RangeCalendarCard
                      startDate={attachFromDate}
                      endDate={attachToDate}
                      onChange={(start, end) => {
                        setAttachFromDate(start)
                        setAttachToDate(end)
                      }}
                    />

                    {/* Card filter */}
                    {creditCards.length > 0 && (
                      <CardMultiSelect
                        cards={creditCards}
                        value={attachSelectedCardIds}
                        onChange={setAttachSelectedCardIds}
                      />
                    )}

                    {/* Date field toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">Filter by:</span>
                      <div className="flex rounded-lg border border-text-muted/20 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setAttachDateField('transaction_date')}
                          className={`px-3 py-1.5 text-xs transition-colors ${
                            attachDateField === 'transaction_date'
                              ? 'bg-primary/20 text-primary'
                              : 'text-text-muted hover:bg-surface/50'
                          }`}
                        >
                          Purchase Date
                        </button>
                        <button
                          type="button"
                          onClick={() => setAttachDateField('charge_date')}
                          className={`px-3 py-1.5 text-xs transition-colors border-s border-text-muted/20 ${
                            attachDateField === 'charge_date'
                              ? 'bg-primary/20 text-primary'
                              : 'text-text-muted hover:bg-surface/50'
                          }`}
                        >
                          Billing Date
                        </button>
                      </div>
                    </div>

                    {/* Connection status filter */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">Status:</span>
                      <div className="flex rounded-lg border border-text-muted/20 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setAttachConnectionStatus('all')}
                          className={`px-3 py-1.5 text-xs transition-colors ${
                            attachConnectionStatus === 'all'
                              ? 'bg-primary/20 text-primary'
                              : 'text-text-muted hover:bg-surface/50'
                          }`}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setAttachConnectionStatus('not_connected')}
                          className={`px-3 py-1.5 text-xs transition-colors border-s border-text-muted/20 ${
                            attachConnectionStatus === 'not_connected'
                              ? 'bg-primary/20 text-primary'
                              : 'text-text-muted hover:bg-surface/50'
                          }`}
                        >
                          Not Connected
                        </button>
                        <button
                          type="button"
                          onClick={() => setAttachConnectionStatus('connected')}
                          className={`px-3 py-1.5 text-xs transition-colors border-s border-text-muted/20 ${
                            attachConnectionStatus === 'connected'
                              ? 'bg-primary/20 text-primary'
                              : 'text-text-muted hover:bg-surface/50'
                          }`}
                        >
                          Connected
                        </button>
                      </div>
                    </div>

                    {/* Search bar */}
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <div className="relative flex-1">
                        <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="text"
                          value={attachSearch}
                          onChange={(e) => setAttachSearch(e.target.value)}
                          placeholder="Search merchant..."
                          className="w-full ps-9 pe-3 py-1.5 text-sm bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/50"
                        />
                      </div>
                    </div>

                    {/* Attach button */}
                    <button
                      type="button"
                      onClick={handleAttach}
                      disabled={isAttaching || attachSelectedIds.size === 0}
                      className="px-4 py-1.5 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                    >
                      {isAttaching ? 'Attaching...' : `Attach Selected (${attachSelectedIds.size})`}
                    </button>
                  </div>

                  {/* Error message */}
                  {attachError && (
                    <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                      {attachError}
                    </div>
                  )}

                  {/* CC transactions list */}
                  {isLoadingCCTxs ? (
                    <div className="text-center py-4 text-text-muted text-sm">Loading...</div>
                  ) : filteredCCTxs.length === 0 ? (
                    <div className="text-center py-4 text-text-muted text-sm">
                      No transactions found
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto border border-text-muted/20 rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-surface">
                          <tr className="border-b border-text-muted/20">
                            <th className="text-center py-2 px-2 w-10">
                              <input
                                type="checkbox"
                                checked={allSelectableSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = someSelectableSelected && !allSelectableSelected
                                }}
                                onChange={handleToggleAllAttach}
                                className={checkboxClass}
                                disabled={selectableCCTxs.length === 0}
                              />
                            </th>
                            <th className="text-start py-2 px-2 text-text-muted font-medium">Purchase</th>
                            <th className="text-start py-2 px-2 text-text-muted font-medium">Billing</th>
                            <th className="text-start py-2 px-2 text-text-muted font-medium">Card</th>
                            <th className="text-start py-2 px-2 text-text-muted font-medium">Merchant</th>
                            <th className="text-end py-2 px-2 text-text-muted font-medium">Amount</th>
                            {attachConnectionStatus !== 'not_connected' && (
                              <th className="text-center py-2 px-2 text-text-muted font-medium w-16">Status</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCCTxs.map((tx) => {
                            const isConnected = !!tx.bank_transaction_id
                            return (
                              <tr key={tx.id} className="border-b border-text-muted/10 hover:bg-background/30">
                                <td className="py-2 px-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={attachSelectedIds.has(tx.id)}
                                    onChange={() => handleToggleAttachSelect(tx.id)}
                                    className={checkboxClass}
                                    disabled={isConnected}
                                  />
                                </td>
                                <td className="py-2 px-2 text-text">
                                  {tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString('he-IL', {
                                    day: '2-digit',
                                    month: '2-digit',
                                  }) : '-'}
                                </td>
                                <td className="py-2 px-2 text-text">
                                  {tx.charge_date ? new Date(tx.charge_date).toLocaleDateString('he-IL', {
                                    day: '2-digit',
                                    month: '2-digit',
                                  }) : '-'}
                                </td>
                                <td className="py-2 px-2 text-text text-xs whitespace-nowrap">
                                  {tx.card_name && <span dir="auto">{tx.card_name}</span>}
                                  {tx.card_name && tx.card_last_four && ' '}
                                  {tx.card_last_four && `-${tx.card_last_four}`}
                                  {!tx.card_name && !tx.card_last_four && '-'}
                                </td>
                                <td className="py-2 px-2 text-text" dir="auto">
                                  {tx.merchant_name || '-'}
                                </td>
                                <td className="py-2 px-2 text-text text-end whitespace-nowrap">
                                  {formatDisplayAmount(tx)}
                                </td>
                                {attachConnectionStatus !== 'not_connected' && (
                                  <td className="py-2 px-2 text-center">
                                    <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-text-muted/30'}`} />
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
            </div>
          </>
        )}
      </Modal.Content>
    </Modal.Overlay>
  )
}
