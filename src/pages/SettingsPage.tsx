import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router'
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
  BuildingOfficeIcon,
  GlobeAltIcon,
  BellIcon,
  CameraIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'
import { useSettingsStore, type DuplicateAction, type MatchingTrigger } from '@/stores/settingsStore'
import { useCreditCards, useCreateCreditCard, useDeleteCreditCard, useUpdateCreditCard } from '@/hooks/useCreditCards'
import { useProfile, useUpdateProfile, useUploadAvatar, useRemoveAvatar } from '@/hooks/useProfile'
import { useAuth } from '@/contexts/AuthContext'
import { ConfirmDialog } from '@/components/ui/base/modal/confirm-dialog'
import { cx } from '@/utils/cx'
import type { Currency, DateFormat, NumberFormat } from '@/types/database'

type SettingsTabId = 'profile' | 'team' | 'rules' | 'credit-cards' | 'billing'

const settingsTabs: { id: SettingsTabId; label: string }[] = [
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
  id?: string
  sectionRef?: React.RefObject<HTMLDivElement | null>
}

function SettingsSection({ icon: Icon, title, description, children, id, sectionRef }: SettingsSectionProps) {
  return (
    <div id={id} ref={sectionRef} className="bg-surface rounded-lg p-6 scroll-mt-24">
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

// Currency options
const CURRENCY_OPTIONS: { value: Currency; label: string; symbol: string }[] = [
  { value: 'ILS', label: 'Israeli Shekel', symbol: '₪' },
  { value: 'USD', label: 'US Dollar', symbol: '$' },
  { value: 'EUR', label: 'Euro', symbol: '€' },
  { value: 'GBP', label: 'British Pound', symbol: '£' },
]

// Date format options
const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string; example: string }[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '29/01/2026' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', example: '01/29/2026' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2026-01-29' },
]

// Number format options
const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string; example: string }[] = [
  { value: 'space_comma', label: 'Space + Comma', example: '1 234,56' },
  { value: 'comma_dot', label: 'Comma + Dot', example: '1,234.56' },
  { value: 'dot_comma', label: 'Dot + Comma', example: '1.234,56' },
]

interface TextInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  type?: 'text' | 'email' | 'tel'
  description?: string
}

function TextInput({ label, value, onChange, placeholder, disabled, type = 'text', description }: TextInputProps) {
  return (
    <div className="py-2">
      <label className="block text-sm font-medium text-text mb-1">{label}</label>
      {description && <p className="text-xs text-text-muted mb-2">{description}</p>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cx(
          'w-full px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary transition-colors',
          disabled && 'opacity-60 cursor-not-allowed bg-text-muted/10'
        )}
      />
    </div>
  )
}

interface TextAreaInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  description?: string
}

function TextAreaInput({ label, value, onChange, placeholder, rows = 3, description }: TextAreaInputProps) {
  return (
    <div className="py-2">
      <label className="block text-sm font-medium text-text mb-1">{label}</label>
      {description && <p className="text-xs text-text-muted mb-2">{description}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none transition-colors"
      />
    </div>
  )
}

interface DropdownSelectProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string; extra?: string }[]
  onChange: (value: T) => void
  description?: string
}

function DropdownSelect<T extends string>({ label, value, options, onChange, description }: DropdownSelectProps<T>) {
  return (
    <div className="py-2">
      <label className="block text-sm font-medium text-text mb-1">{label}</label>
      {description && <p className="text-xs text-text-muted mb-2">{description}</p>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full px-3 py-2 bg-surface border border-text-muted/20 rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}{option.extra ? ` (${option.extra})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

function ProfileTab() {
  const { user } = useAuth()
  const { profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const removeAvatar = useRemoveAvatar()

  // Form state
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [taxId, setTaxId] = useState('')
  const [currency, setCurrency] = useState<Currency>('ILS')
  const [dateFormat, setDateFormat] = useState<DateFormat>('DD/MM/YYYY')
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('comma_dot')
  const [emailNewInvoice, setEmailNewInvoice] = useState(true)
  const [emailPaymentReceived, setEmailPaymentReceived] = useState(true)
  const [emailWeeklySummary, setEmailWeeklySummary] = useState(false)
  const [emailBankSyncAlerts, setEmailBankSyncAlerts] = useState(true)

  // Track if form has unsaved changes
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load profile data into form
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setCompanyName(profile.company_name || '')
      setCompanyAddress(profile.company_address || '')
      setTaxId(profile.tax_id || '')
      setCurrency(profile.currency)
      setDateFormat(profile.date_format)
      setNumberFormat(profile.number_format)
      setEmailNewInvoice(profile.email_new_invoice)
      setEmailPaymentReceived(profile.email_payment_received)
      setEmailWeeklySummary(profile.email_weekly_summary)
      setEmailBankSyncAlerts(profile.email_bank_sync_alerts)
    }
  }, [profile])

  // Track changes
  const checkChanges = useCallback(() => {
    if (!profile) {
      // If no profile exists, any filled field is a change
      return !!(fullName || companyName || companyAddress || taxId ||
        currency !== 'ILS' || dateFormat !== 'DD/MM/YYYY' || numberFormat !== 'comma_dot' ||
        !emailNewInvoice || !emailPaymentReceived || emailWeeklySummary || !emailBankSyncAlerts)
    }
    return (
      fullName !== (profile.full_name || '') ||
      companyName !== (profile.company_name || '') ||
      companyAddress !== (profile.company_address || '') ||
      taxId !== (profile.tax_id || '') ||
      currency !== profile.currency ||
      dateFormat !== profile.date_format ||
      numberFormat !== profile.number_format ||
      emailNewInvoice !== profile.email_new_invoice ||
      emailPaymentReceived !== profile.email_payment_received ||
      emailWeeklySummary !== profile.email_weekly_summary ||
      emailBankSyncAlerts !== profile.email_bank_sync_alerts
    )
  }, [profile, fullName, companyName, companyAddress, taxId, currency, dateFormat, numberFormat, emailNewInvoice, emailPaymentReceived, emailWeeklySummary, emailBankSyncAlerts])

  useEffect(() => {
    setHasChanges(checkChanges())
  }, [checkChanges])

  // Handle save
  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage(null)

    try {
      await updateProfile.mutateAsync({
        full_name: fullName || null,
        company_name: companyName || null,
        company_address: companyAddress || null,
        tax_id: taxId || null,
        currency,
        date_format: dateFormat,
        number_format: numberFormat,
        email_new_invoice: emailNewInvoice,
        email_payment_received: emailPaymentReceived,
        email_weekly_summary: emailWeeklySummary,
        email_bank_sync_alerts: emailBankSyncAlerts,
      })
      setSaveMessage({ type: 'success', text: 'Profile saved successfully' })
      setHasChanges(false)
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save profile' })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle avatar upload
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      await uploadAvatar.mutateAsync(file)
      setSaveMessage({ type: 'success', text: 'Avatar uploaded successfully' })
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to upload avatar' })
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveAvatar = async () => {
    try {
      await removeAvatar.mutateAsync()
      setSaveMessage({ type: 'success', text: 'Avatar removed' })
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to remove avatar' })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Save message */}
      {saveMessage && (
        <div
          className={cx(
            'px-4 py-3 rounded-lg text-sm',
            saveMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
          )}
        >
          {saveMessage.text}
        </div>
      )}

      {/* Personal Information */}
      <SettingsSection
        icon={UserIcon}
        title="Personal Information"
        description="Your personal details and profile picture"
      >
        {/* Avatar Section */}
        <div className="flex items-center gap-6 py-4">
          <div className="relative">
            <div
              className={cx(
                'w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-text-muted/20',
                (uploadAvatar.isPending || removeAvatar.isPending) && 'opacity-50'
              )}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-12 h-12 text-text-muted" />
              )}
            </div>
            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={uploadAvatar.isPending}
              className="absolute -bottom-1 -right-1 p-2 bg-primary rounded-full text-white hover:bg-primary/90 transition-colors shadow-lg disabled:opacity-50"
              title="Upload photo"
            >
              <CameraIcon className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          <div className="flex-1">
            <p className="text-sm text-text">Profile Picture</p>
            <p className="text-xs text-text-muted mt-1">JPEG, PNG, WebP or GIF. Max 5MB (auto-compressed).</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={uploadAvatar.isPending}
                className="px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50"
              >
                {uploadAvatar.isPending ? 'Uploading...' : 'Upload'}
              </button>
              {profile?.avatar_url && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={removeAvatar.isPending}
                  className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {removeAvatar.isPending ? 'Removing...' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-text-muted/10 pt-4">
          <TextInput
            label="Full Name"
            value={fullName}
            onChange={setFullName}
            placeholder="Enter your full name"
          />

          <div className="py-2">
            <label className="block text-sm font-medium text-text mb-1">Email</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-text-muted/10 border border-text-muted/20 rounded-lg">
              <EnvelopeIcon className="w-4 h-4 text-text-muted" />
              <span className="text-text">{user?.email}</span>
              <span className="text-xs text-text-muted ml-auto">From your account</span>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Business Information */}
      <SettingsSection
        icon={BuildingOfficeIcon}
        title="Business Information"
        description="Your company details for invoices and reports"
      >
        <TextInput
          label="Company Name"
          value={companyName}
          onChange={setCompanyName}
          placeholder="Enter your company name"
        />

        <TextAreaInput
          label="Business Address"
          value={companyAddress}
          onChange={setCompanyAddress}
          placeholder="Enter your business address"
          rows={3}
        />

        <TextInput
          label="Tax ID / VAT Number"
          value={taxId}
          onChange={setTaxId}
          placeholder="Enter your tax ID or VAT number"
          description="Used for compliance and official documents"
        />
      </SettingsSection>

      {/* Regional Preferences */}
      <SettingsSection
        icon={GlobeAltIcon}
        title="Regional Preferences"
        description="Format settings for your region"
      >
        <DropdownSelect
          label="Currency"
          value={currency}
          options={CURRENCY_OPTIONS.map((c) => ({ value: c.value, label: c.label, extra: c.symbol }))}
          onChange={setCurrency}
          description="Default currency for transactions and reports"
        />

        <DropdownSelect
          label="Date Format"
          value={dateFormat}
          options={DATE_FORMAT_OPTIONS.map((d) => ({ value: d.value, label: d.label, extra: d.example }))}
          onChange={setDateFormat}
        />

        <DropdownSelect
          label="Number Format"
          value={numberFormat}
          options={NUMBER_FORMAT_OPTIONS.map((n) => ({ value: n.value, label: n.label, extra: n.example }))}
          onChange={setNumberFormat}
          description="How numbers and decimals are displayed"
        />
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection
        icon={BellIcon}
        title="Email Notifications"
        description="Choose what notifications you want to receive"
      >
        <Toggle
          label="New invoice uploaded"
          description="Get notified when a new invoice is uploaded"
          checked={emailNewInvoice}
          onChange={setEmailNewInvoice}
        />
        <Toggle
          label="Payment received"
          description="Get notified when a payment is received"
          checked={emailPaymentReceived}
          onChange={setEmailPaymentReceived}
        />
        <Toggle
          label="Weekly summary"
          description="Receive a weekly summary of your activity"
          checked={emailWeeklySummary}
          onChange={setEmailWeeklySummary}
        />
        <Toggle
          label="Bank sync alerts"
          description="Get notified about bank synchronization events"
          checked={emailBankSyncAlerts}
          onChange={setEmailBankSyncAlerts}
        />
      </SettingsSection>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-4 border-t border-text-muted/10">
        <p className="text-xs text-text-muted">
          {hasChanges ? 'You have unsaved changes' : 'All changes saved'}
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={cx(
            'px-6 py-2 rounded-lg font-medium transition-colors',
            hasChanges
              ? 'bg-primary text-white hover:bg-primary/90'
              : 'bg-text-muted/20 text-text-muted cursor-not-allowed'
          )}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
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

interface RulesTabProps {
  ccLinkingRef?: React.RefObject<HTMLDivElement | null>
}

function RulesTab({ ccLinkingRef }: RulesTabProps) {
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
        id="cc-linking"
        sectionRef={ccLinkingRef}
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
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as SettingsTabId | null
  const sectionParam = searchParams.get('section')
  const validTabs: SettingsTabId[] = ['profile', 'team', 'rules', 'credit-cards', 'billing']

  const [selectedTab, setSelectedTab] = useState<SettingsTabId>(
    tabParam && validTabs.includes(tabParam) ? tabParam : 'rules'
  )
  const ccLinkingRef = useRef<HTMLDivElement>(null)

  // Get current tab index
  const currentTabIndex = settingsTabs.findIndex((tab) => tab.id === selectedTab)

  // Keyboard navigation for tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is interacting with form controls
      const activeEl = document.activeElement
      const isFormControl = activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        activeEl?.getAttribute('role') === 'slider'

      if (isFormControl) {
        return
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedTab(settingsTabs[(currentTabIndex + 1) % settingsTabs.length].id)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedTab(settingsTabs[(currentTabIndex - 1 + settingsTabs.length) % settingsTabs.length].id)
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [currentTabIndex])

  // Scroll to section when specified in URL
  useEffect(() => {
    if (sectionParam === 'cc-linking' && ccLinkingRef.current) {
      // Small delay to ensure the tab content is rendered
      setTimeout(() => {
        ccLinkingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [sectionParam, selectedTab])

  // Sync tab with URL param
  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam) && tabParam !== selectedTab) {
      setSelectedTab(tabParam)
    }
  }, [tabParam])

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
      <div className="flex justify-center mb-6">
        <div className="flex border-b border-border">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                selectedTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text hover:border-text-muted/30'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="pt-6">
        {selectedTab === 'profile' && <ProfileTab />}
        {selectedTab === 'team' && <TeamTab />}
        {selectedTab === 'rules' && <RulesTab ccLinkingRef={ccLinkingRef} />}
        {selectedTab === 'credit-cards' && <CreditCardsTab />}
        {selectedTab === 'billing' && <BillingTab />}
      </div>
    </div>
  )
}
