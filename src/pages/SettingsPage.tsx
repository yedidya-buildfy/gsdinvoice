import { useState } from 'react'
import type { Key } from 'react-aria-components'
import {
  CogIcon,
  DocumentDuplicateIcon,
  CreditCardIcon,
  SparklesIcon,
  LinkIcon,
  UserIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useSettingsStore, type DuplicateAction, type MatchingTrigger } from '@/stores/settingsStore'
import { useCreditCards, useCreateCreditCard, useDeleteCreditCard, useUpdateCreditCard } from '@/hooks/useCreditCards'
import { Tabs, type TabItem } from '@/components/ui/base/tabs/tabs'
import { ConfirmDialog } from '@/components/ui/base/modal/confirm-dialog'
import { cx } from '@/utils/cx'

const settingsTabs: TabItem[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'team', label: 'Team' },
  { id: 'rules', label: 'Rules' },
  { id: 'credit-cards', label: 'Credit Cards' },
  { id: 'billing', label: 'Billing & Plans' },
]

interface SettingsSectionProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: React.ReactNode
}

function SettingsSection({ icon: Icon, title, description, children }: SettingsSectionProps) {
  return (
    <div className="bg-surface rounded-lg p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <p className="text-sm text-text-muted mt-1">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

interface ToggleProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium text-text">{label}</div>
        {description && <div className="text-xs text-text-muted mt-0.5">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface',
          checked ? 'bg-primary' : 'bg-text-muted/30'
        )}
      >
        <span
          className={cx(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  )
}

interface SliderProps {
  label: string
  description?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}

function Slider({ label, description, value, min, max, step = 1, unit = '', onChange }: SliderProps) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-text">{label}</div>
          {description && <div className="text-xs text-text-muted mt-0.5">{description}</div>}
        </div>
        <div className="text-sm font-medium text-primary">
          {value}{unit}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-text-muted/20 rounded-lg appearance-none cursor-pointer accent-primary"
      />
      <div className="flex justify-between text-xs text-text-muted mt-1">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}

interface SelectProps<T extends string> {
  label: string
  description?: string
  value: T
  options: { value: T; label: string; description?: string }[]
  onChange: (value: T) => void
}

function Select<T extends string>({ label, description, value, options, onChange }: SelectProps<T>) {
  return (
    <div className="py-2">
      <div className="mb-2">
        <div className="text-sm font-medium text-text">{label}</div>
        {description && <div className="text-xs text-text-muted mt-0.5">{description}</div>}
      </div>
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cx(
              'w-full flex items-start gap-3 p-3 rounded-lg text-start transition-colors',
              value === option.value
                ? 'bg-primary/10 border-2 border-primary'
                : 'bg-background/50 border border-text-muted/20 hover:bg-background'
            )}
          >
            <div
              className={cx(
                'mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                value === option.value ? 'border-primary' : 'border-text-muted/50'
              )}
            >
              {value === option.value && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </div>
            <div>
              <div className={cx('text-sm font-medium', value === option.value ? 'text-primary' : 'text-text')}>
                {option.label}
              </div>
              {option.description && (
                <div className="text-xs text-text-muted mt-0.5">{option.description}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function ProfileTab() {
  return (
    <div className="space-y-6">
      <SettingsSection
        icon={UserIcon}
        title="Profile"
        description="Manage your personal information"
      >
        <div className="text-sm text-text-muted">
          Profile settings coming soon...
        </div>
      </SettingsSection>
    </div>
  )
}

function TeamTab() {
  return (
    <div className="space-y-6">
      <SettingsSection
        icon={UserGroupIcon}
        title="Team"
        description="Manage team members and permissions"
      >
        <div className="text-sm text-text-muted">
          Team settings coming soon...
        </div>
      </SettingsSection>
    </div>
  )
}

function BillingTab() {
  return (
    <div className="space-y-6">
      <SettingsSection
        icon={CurrencyDollarIcon}
        title="Billing & Plans"
        description="Manage your subscription and billing information"
      >
        <div className="text-sm text-text-muted">
          Billing and plans settings coming soon...
        </div>
      </SettingsSection>
    </div>
  )
}

function RulesTab() {
  const {
    autoExtractOnUpload,
    setAutoExtractOnUpload,
    autoApprovalThreshold,
    setAutoApprovalThreshold,
    duplicateLineItemAction,
    setDuplicateLineItemAction,
    matchingTrigger,
    setMatchingTrigger,
    ccBankAmountTolerance,
    setCcBankAmountTolerance,
    ccBankDateRangeDays,
    setCcBankDateRangeDays,
    matchingConfidenceThreshold,
    setMatchingConfidenceThreshold,
  } = useSettingsStore()

  const duplicateOptions: { value: DuplicateAction; label: string; description: string }[] = [
    { value: 'skip', label: 'Skip duplicates', description: 'Ignore duplicate line items and keep existing data' },
    { value: 'replace', label: 'Replace with new', description: 'Overwrite existing data with new duplicate data' },
    { value: 'add', label: 'Add anyway', description: 'Add duplicate line items as new entries' },
  ]

  const matchingTriggerOptions: { value: MatchingTrigger; label: string; description: string }[] = [
    { value: 'on_upload', label: 'On each upload', description: 'Run matching after each file upload' },
    { value: 'after_all_uploads', label: 'After all uploads', description: 'Run matching once after batch upload completes' },
    { value: 'manual', label: 'Manual only', description: 'Only run matching when triggered manually' },
  ]

  return (
    <div className="space-y-6">
      {/* Extraction Settings */}
      <SettingsSection
        icon={SparklesIcon}
        title="AI Extraction"
        description="Configure automatic invoice data extraction"
      >
        <Toggle
          label="Auto-extract on upload"
          description="Automatically extract data from invoices when uploaded"
          checked={autoExtractOnUpload}
          onChange={setAutoExtractOnUpload}
        />
        <Slider
          label="Auto-approval threshold"
          description="Extractions above this confidence level are auto-approved"
          value={autoApprovalThreshold}
          min={50}
          max={100}
          unit="%"
          onChange={setAutoApprovalThreshold}
        />
      </SettingsSection>

      {/* Duplicate Handling */}
      <SettingsSection
        icon={DocumentDuplicateIcon}
        title="Duplicate Handling"
        description="How to handle duplicate invoice line items"
      >
        <Select
          label="Default action for duplicates"
          description="What to do when duplicate line items are detected"
          value={duplicateLineItemAction}
          options={duplicateOptions}
          onChange={setDuplicateLineItemAction}
        />
      </SettingsSection>

      {/* CC-Bank Linking */}
      <SettingsSection
        icon={CreditCardIcon}
        title="Credit Card Linking"
        description="Settings for linking credit card transactions to bank charges"
      >
        <Slider
          label="Amount tolerance"
          description="Maximum percentage difference for amount matching"
          value={ccBankAmountTolerance}
          min={0}
          max={10}
          step={0.5}
          unit="%"
          onChange={setCcBankAmountTolerance}
        />
        <Slider
          label="Date range"
          description="Maximum days difference for date matching"
          value={ccBankDateRangeDays}
          min={0}
          max={7}
          unit=" days"
          onChange={setCcBankDateRangeDays}
        />
      </SettingsSection>

      {/* Matching Settings */}
      <SettingsSection
        icon={LinkIcon}
        title="Invoice Matching"
        description="Configure how invoices are matched to expenses"
      >
        <Select
          label="Matching trigger"
          description="When to run automatic matching"
          value={matchingTrigger}
          options={matchingTriggerOptions}
          onChange={setMatchingTrigger}
        />
        <Slider
          label="Matching confidence threshold"
          description="Minimum confidence for auto-matching invoices to expenses"
          value={matchingConfidenceThreshold}
          min={50}
          max={100}
          unit="%"
          onChange={setMatchingConfidenceThreshold}
        />
      </SettingsSection>

      {/* Save indicator */}
      <div className="text-center">
        <p className="text-xs text-text-muted">
          Settings are saved automatically
        </p>
      </div>
    </div>
  )
}

const CARD_TYPES = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'American Express' },
  { value: 'isracard', label: 'Isracard' },
  { value: 'leumi-card', label: 'Leumi Card' },
  { value: 'max', label: 'Max' },
  { value: 'cal', label: 'CAL' },
  { value: 'other', label: 'Other' },
]

function CreditCardsTab() {
  const { creditCards, isLoading } = useCreditCards()
  const createCardMutation = useCreateCreditCard()
  const deleteCardMutation = useDeleteCreditCard()
  const updateCardMutation = useUpdateCreditCard()

  const [showAddForm, setShowAddForm] = useState(false)
  const [newCardLastFour, setNewCardLastFour] = useState('')
  const [newCardName, setNewCardName] = useState('')
  const [newCardType, setNewCardType] = useState('visa')
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [editingCardName, setEditingCardName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ cardId: string; cardDisplay: string } | null>(null)

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newCardLastFour.length !== 4 || !/^\d{4}$/.test(newCardLastFour)) {
      return
    }

    try {
      await createCardMutation.mutateAsync({
        cardLastFour: newCardLastFour,
        cardName: newCardName || undefined,
        cardType: newCardType,
      })
      setShowAddForm(false)
      setNewCardLastFour('')
      setNewCardName('')
      setNewCardType('visa')
    } catch (err) {
      console.error('[Settings] Failed to add card:', err)
    }
  }

  const handleDeleteCard = (cardId: string, cardDisplay: string) => {
    setDeleteConfirm({ cardId, cardDisplay })
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return

    try {
      await deleteCardMutation.mutateAsync(deleteConfirm.cardId)
      setDeleteConfirm(null)
    } catch (err) {
      console.error('[Settings] Failed to delete card:', err)
    }
  }

  const handleStartEdit = (cardId: string, currentName: string | null) => {
    setEditingCardId(cardId)
    setEditingCardName(currentName || '')
  }

  const handleCancelEdit = () => {
    setEditingCardId(null)
    setEditingCardName('')
  }

  const handleSaveEdit = async (cardId: string) => {
    try {
      await updateCardMutation.mutateAsync({
        id: cardId,
        cardName: editingCardName || undefined,
      })
      setEditingCardId(null)
      setEditingCardName('')
    } catch (err) {
      console.error('[Settings] Failed to update card:', err)
    }
  }

  const getCardTypeLabel = (type: string) => {
    return CARD_TYPES.find((t) => t.value === type)?.label || type
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        icon={CreditCardIcon}
        title="Credit Cards"
        description="Manage your credit cards for transaction tracking"
      >
        {/* Add Card Button */}
        {!showAddForm && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Card
          </button>
        )}

        {/* Add Card Form */}
        {showAddForm && (
          <form onSubmit={handleAddCard} className="bg-background/50 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Last 4 Digits <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newCardLastFour}
                  onChange={(e) => setNewCardLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  maxLength={4}
                  className="w-full px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Card Name
                </label>
                <input
                  type="text"
                  value={newCardName}
                  onChange={(e) => setNewCardName(e.target.value)}
                  placeholder="e.g., Personal Visa"
                  className="w-full px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Card Type <span className="text-red-400">*</span>
                </label>
                <select
                  value={newCardType}
                  onChange={(e) => setNewCardType(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {CARD_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={createCardMutation.isPending || newCardLastFour.length !== 4}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createCardMutation.isPending ? 'Adding...' : 'Add Card'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false)
                  setNewCardLastFour('')
                  setNewCardName('')
                  setNewCardType('visa')
                }}
                className="px-4 py-2 text-text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Cards List */}
        {isLoading ? (
          <div className="text-sm text-text-muted">Loading cards...</div>
        ) : creditCards.length === 0 ? (
          <div className="text-sm text-text-muted py-4 text-center">
            No credit cards added yet. Add a card above or import a credit card statement.
          </div>
        ) : (
          <div className="space-y-2 mt-4">
            {creditCards.map((card) => (
              <div
                key={card.id}
                className="flex items-center justify-between p-4 bg-background/50 rounded-lg border border-text-muted/10"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CreditCardIcon className="w-5 h-5 text-primary" />
                  </div>
                  {editingCardId === card.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingCardName}
                        onChange={(e) => setEditingCardName(e.target.value)}
                        placeholder="Card name"
                        className="px-2 py-1 bg-surface border border-text-muted/20 rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(card.id)}
                        disabled={updateCardMutation.isPending}
                        className="p-1 text-green-400 hover:text-green-300 transition-colors"
                        title="Save"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="p-1 text-text-muted hover:text-text transition-colors"
                        title="Cancel"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm font-medium text-text">
                        {card.card_name || `Card ending in ${card.card_last_four}`}
                      </div>
                      <div className="text-xs text-text-muted">
                        {getCardTypeLabel(card.card_type)} •••• {card.card_last_four}
                      </div>
                    </div>
                  )}
                </div>
                {editingCardId !== card.id && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(card.id, card.card_name)}
                      className="p-2 text-text-muted hover:text-text transition-colors"
                      title="Edit card name"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCard(card.id, card.card_name || `****${card.card_last_four}`)}
                      disabled={deleteCardMutation.isPending}
                      className="p-2 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                      title="Delete card"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      {/* Info text */}
      <div className="text-center">
        <p className="text-xs text-text-muted">
          Cards are also automatically created when you import credit card statements
        </p>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(null)}
        title="Delete Credit Card"
        message={`Are you sure you want to delete "${deleteConfirm?.cardDisplay}"? All transactions linked to this card will be unlinked.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  )
}

export function SettingsPage() {
  const [selectedTab, setSelectedTab] = useState<Key>('rules')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <CogIcon className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-text">Settings</h1>
          <p className="text-sm text-text-muted">Configure your account and application preferences</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs selectedKey={selectedTab} onSelectionChange={setSelectedTab}>
        <Tabs.List type="underline" items={settingsTabs}>
          {(tab) => <Tabs.Item key={tab.id} id={tab.id} label={tab.label} type="underline" />}
        </Tabs.List>

        <Tabs.Panel id="profile">
          <ProfileTab />
        </Tabs.Panel>

        <Tabs.Panel id="team">
          <TeamTab />
        </Tabs.Panel>

        <Tabs.Panel id="rules">
          <RulesTab />
        </Tabs.Panel>

        <Tabs.Panel id="credit-cards">
          <CreditCardsTab />
        </Tabs.Panel>

        <Tabs.Panel id="billing">
          <BillingTab />
        </Tabs.Panel>
      </Tabs>
    </div>
  )
}
