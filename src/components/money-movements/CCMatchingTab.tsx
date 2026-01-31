import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import {
  TrashIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CreditCardIcon,
  CheckCircleIcon,
  XCircleIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import {
  useCCBankMatchResults,
  useCCBankMatchSummary,
  useUpdateMatchStatus,
  useUnmatchCCTransactions,
  type MatchResultWithDetails,
} from '@/hooks/useCCBankMatchResults'
import { useCreditCards, useCreditCardTransactions, type TransactionWithCard } from '@/hooks/useCreditCards'
import { CreditCardTable, type CCSortColumn } from '@/components/creditcard/CreditCardTable'
import { RangeCalendarCard } from '@/components/ui/date-picker'
import { useAuth } from '@/contexts/AuthContext'
import { useSettingsStore } from '@/stores/settingsStore'
import { runCCBankMatching } from '@/lib/services/ccBankMatcher'
import { formatCurrency } from '@/lib/currency'
import { formatDisplayDate } from '@/lib/utils/dateFormatter'
import type { CreditCard } from '@/types/database'

function formatILS(agorot: number): string {
  return formatCurrency(agorot, 'ILS')
}

interface StatusBadgeProps {
  status: 'pending' | 'approved' | 'rejected' | string
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    pending: { bg: 'bg-warning/20', text: 'text-warning', dot: 'bg-warning', label: 'Pending' },
    approved: { bg: 'bg-success/20', text: 'text-success', dot: 'bg-success', label: 'Approved' },
    rejected: { bg: 'bg-error/20', text: 'text-error', dot: 'bg-error', label: 'Rejected' },
  }[status] || { bg: 'bg-text-muted/20', text: 'text-text-muted', dot: 'bg-text-muted', label: status }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}

interface ConfidenceBadgeProps {
  confidence: number
}

function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const color = confidence >= 80 ? 'success' : confidence >= 60 ? 'warning' : 'error'
  const config = {
    success: 'bg-success/20 text-success',
    warning: 'bg-warning/20 text-warning',
    error: 'bg-error/20 text-error',
  }[color]

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config}`}>
      {Math.round(confidence)}%
    </span>
  )
}

interface CardMultiSelectProps {
  cards: CreditCard[]
  value: string[]
  onChange: (ids: string[]) => void
}

function CardMultiSelect({ cards, value, onChange }: CardMultiSelectProps) {
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
        className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg text-text hover:border-text-muted/40 transition-colors text-xs"
      >
        <CreditCardIcon className="w-4 h-4 text-text-muted" />
        <span>{displayText}</span>
      </button>
      <div className="absolute top-full start-0 mt-1 z-50 hidden group-hover:block bg-surface border border-border rounded-lg shadow-lg min-w-[200px] max-h-[300px] overflow-y-auto">
        <label className="flex items-center gap-2 px-3 py-2 hover:bg-background/50 cursor-pointer text-sm border-b border-border">
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

interface MatchRowProps {
  result: MatchResultWithDetails
  isExpanded: boolean
  onToggle: () => void
  onApprove: () => void
  onReject: () => void
  onUnmatch: () => void
  onDisconnectTransaction: (ccTransactionId: string) => void
  isUpdating: boolean
  isDisconnecting: boolean
}

function MatchRow({
  result,
  isExpanded,
  onToggle,
  onApprove,
  onReject,
  onUnmatch,
  onDisconnectTransaction,
  isUpdating,
  isDisconnecting,
}: MatchRowProps) {
  const discrepancyColor = result.discrepancy_agorot === 0
    ? 'text-success'
    : Math.abs(result.discrepancy_agorot) <= result.bank_amount_agorot * 0.02
      ? 'text-warning'
      : 'text-error'

  // Calculate foreign currency totals and ILS-only total for discrepancy
  const { foreignTotals, ilsOnlyTotal } = useMemo(() => {
    const totals = new Map<string, number>()
    let ilsTotal = 0
    for (const tx of result.cc_transactions) {
      if (tx.foreign_amount_cents && tx.foreign_currency) {
        const current = totals.get(tx.foreign_currency) || 0
        totals.set(tx.foreign_currency, current + Math.abs(tx.foreign_amount_cents))
      } else {
        // ILS transaction (no foreign currency)
        ilsTotal += Math.abs(tx.amount_agorot)
      }
    }
    return { foreignTotals: totals, ilsOnlyTotal: ilsTotal }
  }, [result.cc_transactions])

  // Calculate ILS discrepancy (bank amount minus ILS-only CC transactions)
  const ilsDiscrepancy = result.bank_amount_agorot - ilsOnlyTotal

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header Row */}
      <div
        className="flex items-center gap-4 p-4 bg-surface cursor-pointer hover:bg-surface-hover transition-colors"
        onClick={onToggle}
      >
        <button type="button" className="text-text-secondary">
          {isExpanded ? (
            <ChevronUpIcon className="w-5 h-5" />
          ) : (
            <ChevronDownIcon className="w-5 h-5" />
          )}
        </button>

        <div className="flex items-center gap-2 min-w-[100px]">
          <CreditCardIcon className="w-4 h-4 text-text-muted" />
          <span className="font-mono text-sm text-text">{result.card_last_four}</span>
        </div>

        <div className="min-w-[90px] text-sm text-text-secondary">
          {formatDisplayDate(result.charge_date)}
        </div>

        <div className="flex-1 truncate text-sm text-text">
          {result.bank_transaction?.description || 'Unknown'}
        </div>

        <div className="min-w-[90px] text-left">
          <div className="text-sm font-medium text-text">
            {formatILS(result.bank_amount_agorot)}
          </div>
          <div className="text-xs text-text-muted">Bank</div>
        </div>

        <div className="min-w-[120px] text-left">
          <div className="text-sm font-medium text-text">
            {formatILS(result.total_cc_amount_agorot)}
          </div>
          {foreignTotals.size > 0 && (
            <div className="text-xs text-text-muted">
              {Array.from(foreignTotals.entries()).map(([currency, cents]) => (
                <span key={currency} className="me-2">
                  {(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                </span>
              ))}
            </div>
          )}
          <div className="text-xs text-text-muted">
            {result.cc_transaction_count} CC txs
          </div>
        </div>

        <div className="min-w-[100px] text-left">
          {foreignTotals.size > 0 ? (
            <>
              {/* Show foreign currency amounts */}
              {Array.from(foreignTotals.entries()).map(([currency, cents]) => (
                <div key={currency} className="text-sm font-medium text-text">
                  {(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                </div>
              ))}
              {/* Show ILS discrepancy if there are ILS transactions or remaining discrepancy */}
              {(ilsOnlyTotal > 0 || ilsDiscrepancy !== 0) && (
                <div className={`text-sm font-medium ${ilsDiscrepancy === 0 ? 'text-success' : Math.abs(ilsDiscrepancy) <= result.bank_amount_agorot * 0.02 ? 'text-warning' : 'text-error'}`}>
                  {ilsDiscrepancy >= 0 ? '+' : ''}{formatILS(ilsDiscrepancy)}
                </div>
              )}
            </>
          ) : (
            <div className={`text-sm font-medium ${discrepancyColor}`}>
              {result.discrepancy_agorot >= 0 ? '+' : ''}
              {formatILS(result.discrepancy_agorot)}
            </div>
          )}
          <div className="text-xs text-text-muted">Diff</div>
        </div>

        <div className="min-w-[60px] text-center">
          <ConfidenceBadge confidence={result.match_confidence} />
        </div>

        <div className="min-w-[80px]">
          <StatusBadge status={result.status || 'pending'} />
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {result.status === 'pending' && (
            <>
              <button
                type="button"
                onClick={onApprove}
                disabled={isUpdating}
                className="p-1.5 rounded hover:bg-success/10 text-success transition-colors disabled:opacity-50"
                title="Approve match"
              >
                <CheckCircleIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onReject}
                disabled={isUpdating}
                className="p-1.5 rounded hover:bg-error/10 text-error transition-colors disabled:opacity-50"
                title="Reject match"
              >
                <XCircleIcon className="w-5 h-5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onUnmatch}
            disabled={isUpdating}
            className="p-1.5 rounded hover:bg-text-muted/10 text-text-muted transition-colors disabled:opacity-50"
            title="Unmatch"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Expanded Content - CC Transactions */}
      {isExpanded && (
        <div className="bg-background border-t border-border">
          <div className="p-4">
            <div className="text-sm font-medium text-text mb-3">
              CC Transactions ({result.cc_transactions.length})
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start py-2 px-3 text-text-muted font-medium">Date</th>
                  <th className="text-start py-2 px-3 text-text-muted font-medium">Billing</th>
                  <th className="text-start py-2 px-3 text-text-muted font-medium">Merchant</th>
                  <th className="text-end py-2 px-3 text-text-muted font-medium">Amount</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium">Card</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium w-16">Action</th>
                </tr>
              </thead>
              <tbody>
                {result.cc_transactions.map((ccTx) => (
                  <tr key={ccTx.id} className="border-b border-border/50 hover:bg-surface/50">
                    <td className="py-2 px-3 text-text-secondary whitespace-nowrap">
                      {formatDisplayDate(ccTx.transaction_date)}
                    </td>
                    <td className="py-2 px-3 text-text-secondary whitespace-nowrap">
                      {ccTx.charge_date ? formatDisplayDate(ccTx.charge_date) : '-'}
                    </td>
                    <td className="py-2 px-3 text-text" dir="auto">
                      {ccTx.merchant_name}
                    </td>
                    <td className="py-2 px-3 text-end font-medium text-text whitespace-nowrap">
                      {ccTx.foreign_amount_cents && ccTx.foreign_currency
                        ? `${(Math.abs(ccTx.foreign_amount_cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccTx.foreign_currency}`
                        : `${(Math.abs(ccTx.amount_agorot) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ILS`}
                    </td>
                    <td className="py-2 px-3 text-center text-text-muted font-mono text-xs whitespace-nowrap">
                      {ccTx.card_name && <span dir="auto">{ccTx.card_name} </span>}
                      {ccTx.card_last_four ? `-${ccTx.card_last_four}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onDisconnectTransaction(ccTx.id)}
                        disabled={isDisconnecting}
                        className="p-1.5 rounded hover:bg-red-500/10 text-red-400 transition-colors disabled:opacity-50"
                        title="Disconnect this transaction"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

interface CCMatchingTabProps {
  onOpenLinkModal: (ccTransactionId: string) => void
  onRefetch?: () => void
}

export function CCMatchingTab({ onOpenLinkModal, onRefetch }: CCMatchingTabProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { ccBankDateRangeDays, ccBankAmountTolerance } = useSettingsStore()
  const { matchResults, isLoading, refetch } = useCCBankMatchResults()
  const { summary } = useCCBankMatchSummary()
  const { updateStatus, isUpdating: isStatusUpdating } = useUpdateMatchStatus()
  const { unmatch, isUnmatching } = useUnmatchCCTransactions()
  const { creditCards } = useCreditCards()
  const { transactions: allCCTransactions, isLoading: isLoadingCC, refetch: refetchCC } = useCreditCardTransactions()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isRerunning, setIsRerunning] = useState(false)

  // Filters
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Unmatched CC transactions table state
  const [unmatchedSortColumn, setUnmatchedSortColumn] = useState<CCSortColumn>('date')
  const [unmatchedSortDirection, setUnmatchedSortDirection] = useState<'asc' | 'desc'>('desc')

  // Filtered match results
  const filteredResults = useMemo(() => {
    let results = matchResults

    // Filter by card
    if (selectedCardIds.length > 0) {
      const selectedCardLastFours = creditCards
        .filter(c => selectedCardIds.includes(c.id))
        .map(c => c.card_last_four)
      results = results.filter(r => selectedCardLastFours.includes(r.card_last_four))
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      results = results.filter(r => r.status === selectedStatus)
    }

    // Filter by date range
    if (dateFrom) {
      results = results.filter(r => r.charge_date >= dateFrom)
    }
    if (dateTo) {
      results = results.filter(r => r.charge_date <= dateTo)
    }

    return results
  }, [matchResults, selectedCardIds, selectedStatus, dateFrom, dateTo, creditCards])

  // Calculate total foreign currency amounts and ILS discrepancy across all matches
  const { totalForeignAmounts, totalIlsDiscrepancy } = useMemo(() => {
    const foreignTotals = new Map<string, number>()
    let ilsDiscrepancy = 0

    for (const result of matchResults) {
      let ilsOnlyTotal = 0
      for (const tx of result.cc_transactions) {
        if (tx.foreign_amount_cents && tx.foreign_currency) {
          const current = foreignTotals.get(tx.foreign_currency) || 0
          foreignTotals.set(tx.foreign_currency, current + Math.abs(tx.foreign_amount_cents))
        } else {
          ilsOnlyTotal += Math.abs(tx.amount_agorot)
        }
      }
      ilsDiscrepancy += result.bank_amount_agorot - ilsOnlyTotal
    }

    return { totalForeignAmounts: foreignTotals, totalIlsDiscrepancy: ilsDiscrepancy }
  }, [matchResults])

  // Unmatched CC transactions for Section C (filter from all CC transactions)
  const unmatchedCCTxs = useMemo(() => {
    return allCCTransactions.filter(tx => !tx.cc_bank_link_id)
  }, [allCCTransactions])

  // Sort unmatched transactions
  const sortedUnmatchedCCTxs = useMemo(() => {
    return [...unmatchedCCTxs].sort((a, b) => {
      let aVal: string | number | boolean | null | undefined
      let bVal: string | number | boolean | null | undefined

      // Handle special columns
      if (unmatchedSortColumn === 'credit_card_id') {
        aVal = a.credit_card?.card_last_four || ''
        bVal = b.credit_card?.card_last_four || ''
      } else if (unmatchedSortColumn === 'vat_amount') {
        const aHasVat = a.has_vat ?? false
        const bHasVat = b.has_vat ?? false
        const aVatPct = a.vat_percentage ?? 18
        const bVatPct = b.vat_percentage ?? 18
        aVal = aHasVat ? Math.round(a.amount_agorot * aVatPct / (100 + aVatPct)) : 0
        bVal = bHasVat ? Math.round(b.amount_agorot * bVatPct / (100 + bVatPct)) : 0
      } else if (unmatchedSortColumn === 'linked_bank_transaction_id') {
        aVal = a.credit_card_id !== null ? 1 : 0
        bVal = b.credit_card_id !== null ? 1 : 0
      } else if (unmatchedSortColumn === 'cc_bank_link_id') {
        aVal = a.cc_bank_link_id ? 1 : 0
        bVal = b.cc_bank_link_id ? 1 : 0
      } else if (unmatchedSortColumn === 'credit_card') {
        // Skip sorting by the credit_card object itself
        return 0
      } else {
        const col = unmatchedSortColumn as keyof Omit<TransactionWithCard, 'credit_card'>
        aVal = a[col] as string | number | boolean | null | undefined
        bVal = b[col] as string | number | boolean | null | undefined
      }

      // Handle dates
      if (unmatchedSortColumn === 'date' || unmatchedSortColumn === 'value_date') {
        aVal = aVal ? new Date(aVal as string).getTime() : 0
        bVal = bVal ? new Date(bVal as string).getTime() : 0
      }

      // Handle nulls
      if (aVal === null || aVal === undefined) aVal = unmatchedSortColumn === 'foreign_currency' ? '' : 0
      if (bVal === null || bVal === undefined) bVal = unmatchedSortColumn === 'foreign_currency' ? '' : 0

      if (aVal < bVal) return unmatchedSortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return unmatchedSortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [unmatchedCCTxs, unmatchedSortColumn, unmatchedSortDirection])

  const handleUnmatchedSort = (column: CCSortColumn) => {
    if (column === unmatchedSortColumn) {
      setUnmatchedSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setUnmatchedSortColumn(column)
      setUnmatchedSortDirection('desc')
    }
  }

  const handleRerunMatching = async () => {
    if (!user || isRerunning) return

    setIsRerunning(true)
    try {
      await runCCBankMatching(user.id, {
        dateToleranceDays: ccBankDateRangeDays,
        amountTolerancePercent: ccBankAmountTolerance,
      })
      refetch()
      refetchCC()
      onRefetch?.()
    } catch (err) {
      console.error('Failed to rerun matching:', err)
    } finally {
      setIsRerunning(false)
    }
  }

  const handleApprove = async (matchId: string) => {
    await updateStatus(matchId, 'approved')
  }

  const handleReject = async (matchId: string) => {
    await updateStatus(matchId, 'rejected')
  }

  const handleUnmatch = async (result: MatchResultWithDetails) => {
    const ccIds = result.cc_transactions.map(tx => tx.id)
    await unmatch(result.id, ccIds)
    refetch()
    refetchCC()
    onRefetch?.()
  }

  const handleDisconnectTransaction = async (matchId: string, ccTransactionId: string) => {
    await unmatch(matchId, [ccTransactionId])
    refetch()
    refetchCC()
    onRefetch?.()
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-10 bg-surface-hover rounded w-48 mb-4"></div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-surface-hover rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section A: Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Date range */}
          <RangeCalendarCard
            startDate={dateFrom}
            endDate={dateTo}
            onChange={(start, end) => {
              setDateFrom(start)
              setDateTo(end)
            }}
          />

          {/* Card filter */}
          {creditCards.length > 0 && (
            <CardMultiSelect
              cards={creditCards}
              value={selectedCardIds}
              onChange={setSelectedCardIds}
            />
          )}

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Status:</span>
            <div className="flex rounded-lg border border-text-muted/20 overflow-hidden">
              <button
                type="button"
                onClick={() => setSelectedStatus('all')}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  selectedStatus === 'all'
                    ? 'bg-primary/20 text-primary'
                    : 'text-text-muted hover:bg-surface/50'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus('pending')}
                className={`px-3 py-1.5 text-xs transition-colors border-s border-text-muted/20 ${
                  selectedStatus === 'pending'
                    ? 'bg-primary/20 text-primary'
                    : 'text-text-muted hover:bg-surface/50'
                }`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus('approved')}
                className={`px-3 py-1.5 text-xs transition-colors border-s border-text-muted/20 ${
                  selectedStatus === 'approved'
                    ? 'bg-primary/20 text-primary'
                    : 'text-text-muted hover:bg-surface/50'
                }`}
              >
                Approved
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus('rejected')}
                className={`px-3 py-1.5 text-xs transition-colors border-s border-text-muted/20 ${
                  selectedStatus === 'rejected'
                    ? 'bg-primary/20 text-primary'
                    : 'text-text-muted hover:bg-surface/50'
                }`}
              >
                Rejected
              </button>
            </div>
          </div>

          {/* Settings Display */}
          <button
            type="button"
            onClick={() => navigate('/settings?tab=rules&section=cc-linking')}
            className="flex items-center gap-2 px-3 py-1.5 bg-background rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
            title="Edit matching rules"
          >
            <Cog6ToothIcon className="w-4 h-4 text-text-muted" />
            <span className="text-xs text-text-muted">
              +/-{ccBankDateRangeDays} days | +/-{ccBankAmountTolerance}%
            </span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRerunMatching}
            disabled={isRerunning}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowPathIcon className={`w-4 h-4 ${isRerunning ? 'animate-spin' : ''}`} />
            {isRerunning ? 'Running...' : 'Run Matching'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-background rounded-lg p-4 border border-border">
          <div className="text-text-secondary text-sm">Total Matches</div>
          <div className="text-2xl font-semibold mt-1 text-text">{summary.totalMatches}</div>
          <div className="text-text-muted text-xs mt-1">{summary.totalCCTransactions} CC transactions</div>
        </div>
        <div className="bg-background rounded-lg p-4 border border-border">
          <div className="text-text-secondary text-sm">Pending Approval</div>
          <div className={`text-2xl font-semibold mt-1 ${summary.pendingCount > 0 ? 'text-warning' : 'text-text'}`}>
            {summary.pendingCount}
          </div>
        </div>
        <div className="bg-background rounded-lg p-4 border border-border">
          <div className="text-text-secondary text-sm">Total Discrepancy</div>
          {totalForeignAmounts.size > 0 ? (
            <div className="mt-1 space-y-0.5">
              {Array.from(totalForeignAmounts.entries()).map(([currency, cents]) => (
                <div key={currency} className="text-lg font-semibold text-text">
                  {(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                </div>
              ))}
              {(totalIlsDiscrepancy !== 0) && (
                <div className={`text-lg font-semibold ${totalIlsDiscrepancy === 0 ? 'text-success' : 'text-warning'}`}>
                  {totalIlsDiscrepancy >= 0 ? '+' : ''}{formatILS(totalIlsDiscrepancy)}
                </div>
              )}
            </div>
          ) : (
            <div className={`text-2xl font-semibold mt-1 ${summary.totalDiscrepancyAgorot === 0 ? 'text-success' : 'text-warning'}`}>
              {formatILS(summary.totalDiscrepancyAgorot)}
            </div>
          )}
        </div>
      </div>

      {/* Section B: Match Results List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text">
            Match Results ({filteredResults.length})
          </h3>
        </div>

        {filteredResults.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <CreditCardIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No matches to display</p>
            <p className="text-sm mt-1">
              Upload CC and bank files, then run matching to see results
            </p>
          </div>
        ) : (
          filteredResults.map((result) => (
            <MatchRow
              key={result.id}
              result={result}
              isExpanded={expandedId === result.id}
              onToggle={() => setExpandedId(expandedId === result.id ? null : result.id)}
              onApprove={() => handleApprove(result.id)}
              onReject={() => handleReject(result.id)}
              onUnmatch={() => handleUnmatch(result)}
              onDisconnectTransaction={(ccTxId) => handleDisconnectTransaction(result.id, ccTxId)}
              isUpdating={isStatusUpdating || isUnmatching}
              isDisconnecting={isUnmatching}
            />
          ))
        )}
      </div>

      {/* Section C: Unmatched Transactions */}
      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-text">
            Unmatched CC Transactions ({unmatchedCCTxs.length})
          </h3>
        </div>

        {isLoadingCC ? (
          <CreditCardTable
            transactions={[]}
            isLoading
            sortColumn={unmatchedSortColumn}
            sortDirection={unmatchedSortDirection}
            onSort={handleUnmatchedSort}
          />
        ) : unmatchedCCTxs.length === 0 ? (
          <div className="text-center py-4 text-text-muted text-sm">
            All CC transactions are matched
          </div>
        ) : (
          <CreditCardTable
            transactions={sortedUnmatchedCCTxs}
            sortColumn={unmatchedSortColumn}
            sortDirection={unmatchedSortDirection}
            onSort={handleUnmatchedSort}
            onLinkCCTransaction={onOpenLinkModal}
          />
        )}
      </div>
    </div>
  )
}
