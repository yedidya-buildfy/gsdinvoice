import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { useSubscription, useCurrentUsage, usePlanLimits, useCheckout, useManageSubscription } from '@/hooks/useSubscription'
import type { PlanLimits } from '@/types/subscription'
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
  MinusIcon,
  AdjustmentsHorizontalIcon,
  CloudArrowUpIcon,
  TableCellsIcon,
  UserPlusIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'
import { useSettingsStore, type DuplicateAction, type MatchingTrigger, type TablePageSize } from '@/stores/settingsStore'
import { useCreditCards, useCreateCreditCard, useDeleteCreditCard, useUpdateCreditCard } from '@/hooks/useCreditCards'
import { useProfile, useUpdateProfile, useUploadAvatar, useRemoveAvatar } from '@/hooks/useProfile'
import { useAuth } from '@/contexts/AuthContext'
import { useTeam } from '@/contexts/TeamContext'
import { ConfirmDialog } from '@/components/ui/base/modal/confirm-dialog'
import { TeamMemberList, PendingInvitationsList, InviteMemberModal } from '@/components/team'
import { VendorAliasesSection } from '@/components/settings/VendorAliasesSection'
import { useUpdateTeam, useLeaveTeam, useDeleteTeam } from '@/hooks/useTeamManagement'
import { canManageTeam, canInviteMembers, canDeleteTeam } from '@/lib/permissions'
import { cx } from '@/utils/cx'
import type { Currency, DateFormat, NumberFormat } from '@/types/database'

type SettingsTabId = 'profile' | 'team' | 'rules' | 'credit-cards' | 'billing'

const settingsTabs: { id: SettingsTabId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'team', label: 'Business' },
  { id: 'rules', label: 'Rules' },
  { id: 'credit-cards', label: 'Credit Cards' },
  { id: 'billing', label: 'Billing & Plans' },
]


// Segmented Control - for small option sets (2-4 options)
interface SegmentedControlProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

function SegmentedControl<T extends string>({ value, options, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex rounded-lg bg-background/50 p-1 border border-text-muted/10">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150',
            value === option.value
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-muted hover:text-text hover:bg-surface/50'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// Number Stepper - for discrete numeric values with +/- buttons
interface NumberStepperProps {
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}

function NumberStepper({ value, min, max, step = 1, unit = '', onChange }: NumberStepperProps) {
  const handleDecrement = () => {
    const newValue = Math.max(min, value - step)
    onChange(newValue)
  }

  const handleIncrement = () => {
    const newValue = Math.min(max, value + step)
    onChange(newValue)
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-text-muted/20 bg-background/50">
      <button
        type="button"
        onClick={handleDecrement}
        disabled={value <= min}
        className="p-2 text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <MinusIcon className="w-4 h-4" />
      </button>
      <div className="px-3 py-1.5 min-w-[60px] text-center text-sm font-medium text-text border-x border-text-muted/20">
        {value}{unit}
      </div>
      <button
        type="button"
        onClick={handleIncrement}
        disabled={value >= max}
        className="p-2 text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <PlusIcon className="w-4 h-4" />
      </button>
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
      setCurrency((profile.currency as Currency) || 'ILS')
      setDateFormat((profile.date_format as DateFormat) || 'DD/MM/YYYY')
      setNumberFormat((profile.number_format as NumberFormat) || 'comma_dot')
      setEmailNewInvoice(profile.email_new_invoice ?? true)
      setEmailPaymentReceived(profile.email_payment_received ?? true)
      setEmailWeeklySummary(profile.email_weekly_summary ?? false)
      setEmailBankSyncAlerts(profile.email_bank_sync_alerts ?? true)
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

  const currencySegmentOptions = CURRENCY_OPTIONS.map(c => ({ value: c.value, label: c.symbol }))
  const dateFormatSegmentOptions = DATE_FORMAT_OPTIONS.map(d => ({ value: d.value, label: d.value.split('/')[0] === 'DD' ? 'DD/MM' : d.value.split('/')[0] === 'MM' ? 'MM/DD' : 'ISO' }))

  return (
    <div className="space-y-5">
      {/* Save message */}
      {saveMessage && (
        <div
          className={cx(
            'px-4 py-3 rounded-xl text-sm',
            saveMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
          )}
        >
          {saveMessage.text}
        </div>
      )}

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* === PERSONAL INFORMATION SECTION === */}
        <div className="md:col-span-2 lg:col-span-3">
          <div className="flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-text-muted" />
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Personal Information</h4>
          </div>
        </div>

        {/* Avatar Card - Large featured card */}
        <div className="md:col-span-2 lg:col-span-1 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div
                className={cx(
                  'w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden border-2 border-primary/30',
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
                  <UserIcon className="w-12 h-12 text-primary/50" />
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
            <h3 className="text-base font-semibold text-text">{fullName || 'Your Name'}</h3>
            <p className="text-xs text-text-muted mt-1">{user?.email}</p>
            <div className="flex items-center gap-2 mt-4">
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={uploadAvatar.isPending}
                className="px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50"
              >
                {uploadAvatar.isPending ? 'Uploading...' : 'Change Photo'}
              </button>
              {profile?.avatar_url && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={removeAvatar.isPending}
                  className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Personal Info Card */}
        <div className="md:col-span-2 bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <EnvelopeIcon className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Contact Details</h3>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-3 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Email</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-text-muted/5 border border-text-muted/10 rounded-lg">
                  <EnvelopeIcon className="w-4 h-4 text-text-muted" />
                  <span className="text-sm text-text truncate">{user?.email}</span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Role</label>
              <div className="flex items-center gap-2 px-3 py-2 bg-text-muted/5 border border-text-muted/10 rounded-lg w-fit">
                <UserGroupIcon className="w-4 h-4 text-text-muted" />
                <span className="text-sm text-text">Owner</span>
                <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">Admin</span>
              </div>
            </div>
          </div>
        </div>

        {/* === BUSINESS INFORMATION SECTION === */}
        <div className="md:col-span-2 lg:col-span-3 pt-4">
          <div className="flex items-center gap-2">
            <BuildingOfficeIcon className="w-4 h-4 text-text-muted" />
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Business Information</h4>
          </div>
        </div>

        {/* Business Info Card - spans 2 cols */}
        <div className="md:col-span-2 lg:col-span-2 bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <BuildingOfficeIcon className="w-5 h-5 text-purple-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Company Details</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your company"
                className="w-full px-3 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Tax ID / VAT</label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="Tax ID or VAT number"
                className="w-full px-3 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-text-muted mb-1.5">Business Address</label>
              <textarea
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                placeholder="Enter your business address"
                rows={2}
                className="w-full px-3 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Tax Info Card */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5 flex flex-col items-center justify-center text-center">
          <div className="p-3 bg-amber-500/10 rounded-xl mb-3">
            <DocumentDuplicateIcon className="w-6 h-6 text-amber-500" />
          </div>
          <h3 className="text-sm font-semibold text-text">Tax Documents</h3>
          <p className="text-xs text-text-muted mt-1 mb-3">Manage tax certificates</p>
          <span className="text-xs text-text-muted/50 italic">Coming soon</span>
        </div>

        {/* === REGIONAL PREFERENCES SECTION === */}
        <div className="md:col-span-2 lg:col-span-3 pt-4">
          <div className="flex items-center gap-2">
            <GlobeAltIcon className="w-4 h-4 text-text-muted" />
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Regional Preferences</h4>
          </div>
        </div>

        {/* Currency Card */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <CurrencyDollarIcon className="w-5 h-5 text-emerald-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Currency</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">Default currency</p>
          <SegmentedControl
            value={currency}
            options={currencySegmentOptions}
            onChange={setCurrency}
          />
        </div>

        {/* Date Format Card */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <GlobeAltIcon className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Date Format</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">Display format</p>
          <SegmentedControl
            value={dateFormat}
            options={dateFormatSegmentOptions}
            onChange={setDateFormat}
          />
        </div>

        {/* Number Format Card */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-cyan-500/10 rounded-lg">
              <AdjustmentsHorizontalIcon className="w-5 h-5 text-cyan-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Numbers</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">Number format</p>
          <SegmentedControl
            value={numberFormat}
            options={[
              { value: 'space_comma', label: '1 234,5' },
              { value: 'comma_dot', label: '1,234.5' },
              { value: 'dot_comma', label: '1.234,5' },
            ]}
            onChange={setNumberFormat}
          />
        </div>

        {/* === EMAIL NOTIFICATIONS SECTION === */}
        <div className="md:col-span-2 lg:col-span-3 pt-4">
          <div className="flex items-center gap-2">
            <BellIcon className="w-4 h-4 text-text-muted" />
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Email Notifications</h4>
          </div>
        </div>

        {/* Notification Cards */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <DocumentDuplicateIcon className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text">New Invoice</h3>
                <p className="text-xs text-text-muted">When uploaded</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={emailNewInvoice}
              onClick={() => setEmailNewInvoice(!emailNewInvoice)}
              className={cx(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                emailNewInvoice ? 'bg-primary' : 'bg-text-muted/30'
              )}
            >
              <span className={cx('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition', emailNewInvoice ? 'translate-x-5' : 'translate-x-0')} />
            </button>
          </div>
        </div>

        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CurrencyDollarIcon className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text">Payment</h3>
                <p className="text-xs text-text-muted">When received</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={emailPaymentReceived}
              onClick={() => setEmailPaymentReceived(!emailPaymentReceived)}
              className={cx(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                emailPaymentReceived ? 'bg-primary' : 'bg-text-muted/30'
              )}
            >
              <span className={cx('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition', emailPaymentReceived ? 'translate-x-5' : 'translate-x-0')} />
            </button>
          </div>
        </div>

        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <EnvelopeIcon className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text">Weekly Summary</h3>
                <p className="text-xs text-text-muted">Activity digest</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={emailWeeklySummary}
              onClick={() => setEmailWeeklySummary(!emailWeeklySummary)}
              className={cx(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                emailWeeklySummary ? 'bg-primary' : 'bg-text-muted/30'
              )}
            >
              <span className={cx('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition', emailWeeklySummary ? 'translate-x-5' : 'translate-x-0')} />
            </button>
          </div>
        </div>

        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <LinkIcon className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text">Bank Sync</h3>
                <p className="text-xs text-text-muted">Sync alerts</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={emailBankSyncAlerts}
              onClick={() => setEmailBankSyncAlerts(!emailBankSyncAlerts)}
              className={cx(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                emailBankSyncAlerts ? 'bg-primary' : 'bg-text-muted/30'
              )}
            >
              <span className={cx('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition', emailBankSyncAlerts ? 'translate-x-5' : 'translate-x-0')} />
            </button>
          </div>
        </div>

      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-4">
        <div className="flex items-center gap-2">
          {hasChanges ? (
            <>
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <p className="text-xs text-text-muted">Unsaved changes</p>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <p className="text-xs text-text-muted">All changes saved</p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={cx(
            'px-6 py-2 rounded-xl font-medium transition-colors',
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

// Bento Section component for Business tab
interface BentoSectionProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: React.ReactNode
}

function BentoSection({ icon: Icon, title, description, children }: BentoSectionProps) {
  return (
    <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function TeamTab() {
  const { currentTeam, teams } = useTeam()
  const updateTeam = useUpdateTeam()
  const leaveTeam = useLeaveTeam()
  const deleteTeam = useDeleteTeam()

  const [teamName, setTeamName] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [hasNameChanges, setHasNameChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load business name
  useEffect(() => {
    if (currentTeam) {
      setTeamName(currentTeam.name)
    }
  }, [currentTeam])

  // Track name changes
  useEffect(() => {
    setHasNameChanges(teamName !== currentTeam?.name)
  }, [teamName, currentTeam?.name])

  const handleSaveTeamName = async () => {
    if (!currentTeam || !hasNameChanges) return

    setIsSaving(true)
    setSaveMessage(null)

    try {
      await updateTeam.mutateAsync({ name: teamName.trim() })
      setSaveMessage({ type: 'success', text: 'Business name updated' })
      setHasNameChanges(false)
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update business' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleLeaveTeam = async () => {
    if (!currentTeam) return
    try {
      await leaveTeam.mutateAsync(currentTeam.id)
      setShowLeaveConfirm(false)
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to leave business' })
    }
  }

  const handleDeleteTeam = async () => {
    if (!currentTeam) return
    try {
      await deleteTeam.mutateAsync(currentTeam.id)
      setShowDeleteConfirm(false)
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete business' })
    }
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const userRole = currentTeam.role
  const canManage = canManageTeam(userRole)
  const canInvite = canInviteMembers(userRole)
  const canDelete = canDeleteTeam(userRole)
  const isOwner = userRole === 'owner'

  return (
    <div className="space-y-5">
      {/* Save message */}
      {saveMessage && (
        <div
          className={cx(
            'px-4 py-3 rounded-xl text-sm',
            saveMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
          )}
        >
          {saveMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Business Overview Card - Large featured */}
        <div className="md:col-span-2 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <UserGroupIcon className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text">{currentTeam.name}</h3>
                <p className="text-sm text-text-muted mt-1">Manage your business members and settings</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded-full capitalize">{userRole}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Invite Card */}
        {canInvite ? (
          <div className="bg-surface border border-text-muted/10 rounded-xl p-5 flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-primary/10 rounded-xl mb-3">
              <UserPlusIcon className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-text">Invite Member</h3>
            <p className="text-xs text-text-muted mt-1 mb-4">Add business members</p>
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
            >
              Send Invite
            </button>
          </div>
        ) : (
          <div className="bg-surface border border-text-muted/10 rounded-xl p-5 flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-text-muted/10 rounded-xl mb-3">
              <UserPlusIcon className="w-6 h-6 text-text-muted" />
            </div>
            <h3 className="text-sm font-semibold text-text">Invite Member</h3>
            <p className="text-xs text-text-muted mt-1">Admin access required</p>
          </div>
        )}

        {/* Business Settings Card */}
        {canManage && (
          <div className="md:col-span-2 lg:col-span-3">
            <BentoSection
              icon={CogIcon}
              title="Business Settings"
              description="Manage your business name"
            >
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">Business Name</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="Enter business name"
                      className="flex-1 px-3 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                    />
                    {hasNameChanges && (
                      <button
                        type="button"
                        onClick={handleSaveTeamName}
                        disabled={isSaving || !teamName.trim()}
                        className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </BentoSection>
          </div>
        )}

        {/* Business Members Section */}
        <div className="md:col-span-2 lg:col-span-3">
          <div className="flex items-center gap-2 mb-3">
            <UserIcon className="w-4 h-4 text-text-muted" />
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Business Members</h4>
          </div>
          <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
            <TeamMemberList />
          </div>
        </div>

        {/* Pending Invitations Section */}
        {canInvite && (
          <div className="md:col-span-2 lg:col-span-3">
            <div className="flex items-center gap-2 mb-3">
              <EnvelopeIcon className="w-4 h-4 text-text-muted" />
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Pending Invitations</h4>
            </div>
            <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
              <PendingInvitationsList />
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="md:col-span-2 lg:col-span-3">
          <div className="flex items-center gap-2 mb-3">
            <TrashIcon className="w-4 h-4 text-red-400" />
            <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Danger Zone</h4>
          </div>
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5 space-y-3">
            {/* Leave Business (for non-owners) */}
            {!isOwner && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text">Leave Business</p>
                  <p className="text-xs text-text-muted">You will lose access to all business data</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLeaveConfirm(true)}
                  className="px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
                >
                  Leave Business
                </button>
              </div>
            )}

            {/* Delete Business (owner only) */}
            {canDelete && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text">Delete Business</p>
                  <p className="text-xs text-text-muted">Permanently delete this business and all its data</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={teams.length <= 1}
                  className="px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={teams.length <= 1 ? 'Cannot delete your only business' : undefined}
                >
                  Delete Business
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Invite Modal */}
      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />

      {/* Leave Confirmation */}
      <ConfirmDialog
        isOpen={showLeaveConfirm}
        onConfirm={handleLeaveTeam}
        onCancel={() => setShowLeaveConfirm(false)}
        title="Leave Business"
        message={`Are you sure you want to leave "${currentTeam.name}"? You will lose access to all business data.`}
        confirmLabel={leaveTeam.isPending ? 'Leaving...' : 'Leave Business'}
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onConfirm={handleDeleteTeam}
        onCancel={() => setShowDeleteConfirm(false)}
        title="Delete Business"
        message={`Are you sure you want to permanently delete "${currentTeam.name}"? This action cannot be undone and all business data will be lost.`}
        confirmLabel={deleteTeam.isPending ? 'Deleting...' : 'Delete Business'}
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  )
}

function BillingTab() {
  const { data: subscription, isLoading: subLoading } = useSubscription()
  const { data: usage } = useCurrentUsage()
  const { data: planLimits } = usePlanLimits(subscription?.plan_tier)
  const checkout = useCheckout()
  const manageSubscription = useManageSubscription()
  const [searchParams] = useSearchParams()

  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  // Check for success/canceled from Stripe redirect
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setShowSuccessMessage(true)
      setTimeout(() => setShowSuccessMessage(false), 5000)
    }
  }, [searchParams])

  const currentPlan = subscription?.plan_tier || 'free'
  const limits = planLimits as PlanLimits | null
  const invoicesUsed = usage?.invoices_processed ?? 0
  const invoiceLimit = limits?.max_invoices_per_month ?? 20

  const handleUpgrade = async (planId: 'pro' | 'business') => {
    try {
      await checkout.mutateAsync({ planId, interval: billingInterval })
    } catch (err) {
      console.error('Checkout error:', err)
    }
  }

  const handleManageBilling = async () => {
    try {
      await manageSubscription.mutateAsync()
    } catch (err) {
      console.error('Portal error:', err)
    }
  }

  if (subLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const plans = [
    {
      id: 'free' as const,
      name: 'Free',
      description: 'For individuals getting started',
      price: { monthly: 0, yearly: 0 },
      features: [
        '20 invoices/month',
        '1 business',
        '1 team member',
        '1 bank connection',
        'Manual CC matching',
        'Basic reports',
      ],
      color: 'gray',
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      description: 'For growing businesses',
      price: { monthly: 29, yearly: 290 },
      features: [
        '200 invoices/month',
        '3 businesses',
        '3 team members',
        '3 bank connections',
        'Auto CC matching suggestions',
        'Advanced reports & exports',
        'Email support',
      ],
      color: 'primary',
      popular: true,
    },
    {
      id: 'business' as const,
      name: 'Business',
      description: 'For larger organizations',
      price: { monthly: 79, yearly: 790 },
      features: [
        'Unlimited invoices',
        '10 businesses',
        '10 team members',
        'Unlimited bank connections',
        'AI-powered matching',
        'Custom rules & workflows',
        'Priority support',
        'API access',
      ],
      color: 'purple',
    },
  ]

  return (
    <div className="space-y-5">
      {/* Success Message */}
      {showSuccessMessage && (
        <div className="px-4 py-3 rounded-xl text-sm bg-green-500/10 text-green-400 border border-green-500/20">
          <CheckIcon className="w-4 h-4 inline mr-2" />
          Your subscription has been updated successfully!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Current Plan Card - Large featured */}
        <div className="md:col-span-2 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl">
                <CurrencyDollarIcon className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text">Current Plan</h3>
                <p className="text-sm text-text-muted mt-1">
                  You're on the <span className="capitalize font-medium text-text">{currentPlan}</span> plan
                </p>
                {subscription?.trial_end && new Date(subscription.trial_end) > new Date() && (
                  <p className="text-xs text-amber-400 mt-2">
                    Trial ends {new Date(subscription.trial_end).toLocaleDateString()}
                  </p>
                )}
                {subscription?.cancel_at_period_end && (
                  <p className="text-xs text-red-400 mt-2">
                    Cancels at end of period
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={cx(
                'px-3 py-1 text-xs font-medium rounded-full',
                subscription?.status === 'active' || subscription?.status === 'trialing'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : subscription?.status === 'past_due'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
              )}>
                {subscription?.status === 'trialing' ? 'Trial' : subscription?.status || 'Active'}
              </span>
              {subscription?.stripe_customer_id && (
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={manageSubscription.isPending}
                  className="text-xs text-primary hover:underline"
                >
                  {manageSubscription.isPending ? 'Loading...' : 'Manage Billing'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Usage Card */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <DocumentDuplicateIcon className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Usage This Period</h3>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text-muted">Invoices</span>
                <span className="text-text">
                  {invoicesUsed} / {invoiceLimit === null ? '∞' : invoiceLimit}
                </span>
              </div>
              <div className="h-2 bg-text-muted/10 rounded-full overflow-hidden">
                <div
                  className={cx(
                    'h-full rounded-full transition-all',
                    invoiceLimit && invoicesUsed / invoiceLimit > 0.9
                      ? 'bg-red-500'
                      : invoiceLimit && invoicesUsed / invoiceLimit > 0.7
                        ? 'bg-amber-500'
                        : 'bg-primary'
                  )}
                  style={{ width: invoiceLimit ? `${Math.min(100, (invoicesUsed / invoiceLimit) * 100)}%` : '0%' }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text-muted">Business Members</span>
                <span className="text-text">
                  {usage?.team_members_count ?? 1} / {limits?.max_team_members ?? 1}
                </span>
              </div>
              <div className="h-2 bg-text-muted/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: '10%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Billing Interval Toggle */}
        <div className="md:col-span-2 lg:col-span-3 flex justify-center">
          <div className="inline-flex items-center gap-3 p-1 bg-surface border border-text-muted/10 rounded-xl">
            <button
              type="button"
              onClick={() => setBillingInterval('monthly')}
              className={cx(
                'px-4 py-2 text-sm font-medium rounded-lg transition-all',
                billingInterval === 'monthly'
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:text-text'
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval('yearly')}
              className={cx(
                'px-4 py-2 text-sm font-medium rounded-lg transition-all',
                billingInterval === 'yearly'
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:text-text'
              )}
            >
              Yearly
              <span className="ml-1 text-xs text-emerald-400">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Pricing Plans */}
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cx(
              'bg-surface border rounded-xl p-5 flex flex-col',
              plan.popular
                ? 'border-primary/50 ring-1 ring-primary/20'
                : 'border-text-muted/10',
              currentPlan === plan.id && 'ring-2 ring-emerald-500/50'
            )}
          >
            {plan.popular && (
              <div className="text-xs font-medium text-primary mb-2">Most Popular</div>
            )}
            <h3 className="text-lg font-semibold text-text">{plan.name}</h3>
            <p className="text-xs text-text-muted mt-1">{plan.description}</p>

            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">
                ${plan.price[billingInterval]}
              </span>
              <span className="text-sm text-text-muted">
                /{billingInterval === 'monthly' ? 'mo' : 'yr'}
              </span>
            </div>

            <ul className="mt-4 space-y-2 flex-1">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-text-muted">
                  <CheckIcon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-4">
              {currentPlan === plan.id ? (
                <button
                  type="button"
                  disabled
                  className="w-full px-4 py-2 bg-emerald-500/20 text-emerald-400 text-sm rounded-lg"
                >
                  Current Plan
                </button>
              ) : plan.id === 'free' ? (
                subscription?.stripe_subscription_id ? (
                  <button
                    type="button"
                    onClick={handleManageBilling}
                    className="w-full px-4 py-2 border border-text-muted/20 text-text-muted text-sm rounded-lg hover:border-text-muted/40 transition-colors"
                  >
                    Downgrade
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full px-4 py-2 bg-text-muted/10 text-text-muted text-sm rounded-lg"
                  >
                    Free Forever
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => handleUpgrade(plan.id as 'pro' | 'business')}
                  disabled={checkout.isPending}
                  className={cx(
                    'w-full px-4 py-2 text-sm rounded-lg transition-colors',
                    plan.popular
                      ? 'bg-primary text-white hover:bg-primary/90'
                      : 'bg-surface border border-primary text-primary hover:bg-primary/10'
                  )}
                >
                  {checkout.isPending ? 'Loading...' : currentPlan === 'free' ? 'Start 14-Day Trial' : 'Upgrade'}
                </button>
              )}
            </div>
          </div>
        ))}

      </div>
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
    linkingAmountTolerance,
    setLinkingAmountTolerance,
    autoMatchEnabled,
    setAutoMatchEnabled,
    tablePageSize,
    setTablePageSize,
  } = useSettingsStore()

  const duplicateOptions: { value: DuplicateAction; label: string }[] = [
    { value: 'skip', label: 'Skip' },
    { value: 'replace', label: 'Replace' },
    { value: 'add', label: 'Add' },
  ]

  const matchingTriggerOptions: { value: MatchingTrigger; label: string }[] = [
    { value: 'on_upload', label: 'Each upload' },
    { value: 'after_all_uploads', label: 'After batch' },
    { value: 'manual', label: 'Manual' },
  ]

  const pageSizeOptions: { value: string; label: string }[] = [
    { value: '25', label: '25' },
    { value: '50', label: '50' },
    { value: '100', label: '100' },
    { value: '200', label: '200' },
    { value: '999', label: 'All' },
  ]

  return (
    <div className="space-y-5">
      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* === UPLOAD & EXTRACTION SECTION === */}
        <div className="md:col-span-2 lg:col-span-3">
          <div className="flex items-center gap-2">
            <CloudArrowUpIcon className="w-4 h-4 text-text-muted" />
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Upload & Extraction</h4>
          </div>
        </div>

        {/* AI Extraction - Large card spanning 2 cols */}
        <div className="md:col-span-2 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/20 rounded-xl">
                <SparklesIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text">AI Extraction</h3>
                <p className="text-sm text-text-muted mt-1">Automatically extract invoice data on upload</p>
                <div className="mt-4 flex items-center gap-6">
                  <div>
                    <div className="text-xs text-text-muted mb-1">Auto-approval at</div>
                    <NumberStepper
                      value={autoApprovalThreshold}
                      min={50}
                      max={100}
                      step={5}
                      unit="%"
                      onChange={setAutoApprovalThreshold}
                    />
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoExtractOnUpload}
              onClick={() => setAutoExtractOnUpload(!autoExtractOnUpload)}
              className={cx(
                'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface',
                autoExtractOnUpload ? 'bg-primary' : 'bg-text-muted/30'
              )}
            >
              <span
                className={cx(
                  'pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  autoExtractOnUpload ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>

        {/* Duplicate Handling - Small card */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <DocumentDuplicateIcon className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Duplicates</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">When duplicates detected</p>
          <SegmentedControl
            value={duplicateLineItemAction}
            options={duplicateOptions}
            onChange={setDuplicateLineItemAction}
          />
        </div>

        {/* === MATCHING SECTION === */}
        <div className="md:col-span-2 lg:col-span-3 pt-4">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-text-muted" />
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Invoice Matching</h4>
          </div>
        </div>

        {/* Matching Trigger - Small card */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <CloudArrowUpIcon className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Auto-Match</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">Run matching</p>
          <SegmentedControl
            value={matchingTrigger}
            options={matchingTriggerOptions}
            onChange={setMatchingTrigger}
          />
        </div>

        {/* Match Confidence - Small card */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckIcon className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Confidence</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">Min. match confidence</p>
          <NumberStepper
            value={matchingConfidenceThreshold}
            min={50}
            max={100}
            step={5}
            unit="%"
            onChange={setMatchingConfidenceThreshold}
          />
        </div>

        {/* === TRANSACTION LINKING SECTION === */}
        <div className="md:col-span-2 lg:col-span-3 pt-4">
          <div className="flex items-center gap-2">
            <AdjustmentsHorizontalIcon className="w-4 h-4 text-text-muted" />
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Transaction Linking Defaults</h4>
          </div>
        </div>

        {/* Auto-Match Toggle - Small card */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5" id="cc-linking" ref={ccLinkingRef as React.RefObject<HTMLDivElement>}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <BoltIcon className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text">Auto-Match</h3>
                <p className="text-xs text-text-muted">Enable bulk auto-matching</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoMatchEnabled}
              onClick={() => setAutoMatchEnabled(!autoMatchEnabled)}
              className={cx(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                autoMatchEnabled ? 'bg-cyan-500' : 'bg-text-muted/30'
              )}
            >
              <span className={cx('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition', autoMatchEnabled ? 'translate-x-5' : 'translate-x-0')} />
            </button>
          </div>
        </div>

        {/* Amount Tolerance - Slider card */}
        <div className="col-span-2 lg:col-span-2 bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <AdjustmentsHorizontalIcon className="w-5 h-5 text-purple-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Amount Tolerance</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">Minimum match score for auto-linking</p>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={51}
                max={100}
                step={1}
                value={Math.max(51, Math.min(100, linkingAmountTolerance))}
                onChange={(e) => setLinkingAmountTolerance(Number(e.target.value))}
                className="flex-1 h-2 bg-text-muted/20 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className="w-12 text-sm font-medium text-text text-end">{Math.max(51, Math.min(100, linkingAmountTolerance))}%</span>
            </div>
            <div className="flex justify-between text-xs text-text-muted">
              <span>51% = More lenient</span>
              <span>100% = Exact match only</span>
            </div>
          </div>
        </div>

        {/* === CREDIT CARD TO BANK LINKING SECTION === */}
        <div className="md:col-span-2 lg:col-span-3 pt-4">
          <div className="flex items-center gap-2">
            <CreditCardIcon className="w-4 h-4 text-text-muted" />
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Credit Card to Bank Linking</h4>
          </div>
        </div>

        {/* CC-Bank Amount Tolerance */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-500/10 rounded-lg">
              <CreditCardIcon className="w-5 h-5 text-rose-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">CC Tolerance</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">Amount match tolerance</p>
          <NumberStepper
            value={ccBankAmountTolerance}
            min={0}
            max={10}
            step={0.5}
            unit="%"
            onChange={setCcBankAmountTolerance}
          />
        </div>

        {/* CC-Bank Date Range */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <CreditCardIcon className="w-5 h-5 text-orange-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">CC Date Range</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">Date match window</p>
          <NumberStepper
            value={ccBankDateRangeDays}
            min={0}
            max={7}
            step={1}
            unit=" days"
            onChange={setCcBankDateRangeDays}
          />
        </div>

        {/* === TABLE DISPLAY SECTION === */}
        <div className="md:col-span-2 lg:col-span-3 pt-4">
          <div className="flex items-center gap-2">
            <TableCellsIcon className="w-4 h-4 text-text-muted" />
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Table Display</h4>
          </div>
        </div>

        {/* Table Page Size */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <TableCellsIcon className="w-5 h-5 text-indigo-500" />
            </div>
            <h3 className="text-sm font-semibold text-text">Page Size</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">Rows per page in tables</p>
          <SegmentedControl
            value={String(tablePageSize)}
            options={pageSizeOptions}
            onChange={(val) => setTablePageSize(Number(val) as TablePageSize)}
          />
        </div>

      </div>

      {/* Vendor Aliases Section */}
      <VendorAliasesSection className="mt-6" />

      {/* Auto-save indicator */}
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <p className="text-xs text-text-muted">
          Changes saved automatically
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

  // Color based on card type
  const getCardColor = (type: string) => {
    const colors: Record<string, string> = {
      visa: 'blue',
      mastercard: 'orange',
      amex: 'cyan',
      isracard: 'green',
      'leumi-card': 'emerald',
      max: 'purple',
      cal: 'rose',
      other: 'gray',
    }
    return colors[type] || 'gray'
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Add Card - Featured Card */}
        <div className="md:col-span-2 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5">
          {!showAddForm ? (
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/20 rounded-xl">
                  <CreditCardIcon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text">Credit Cards</h3>
                  <p className="text-sm text-text-muted mt-1">Manage cards for transaction tracking</p>
                  <p className="text-xs text-text-muted/70 mt-2">Cards are auto-created when importing statements</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add Card
              </button>
            </div>
          ) : (
            <form onSubmit={handleAddCard}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <PlusIcon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-text">Add New Card</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">Last 4 Digits *</label>
                  <input
                    type="text"
                    value={newCardLastFour}
                    onChange={(e) => setNewCardLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1234"
                    maxLength={4}
                    className="w-full px-3 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">Card Name</label>
                  <input
                    type="text"
                    value={newCardName}
                    onChange={(e) => setNewCardName(e.target.value)}
                    placeholder="Personal Visa"
                    className="w-full px-3 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">Card Type *</label>
                  <select
                    value={newCardType}
                    onChange={(e) => setNewCardType(e.target.value)}
                    className="w-full px-3 py-2 bg-background/50 border border-text-muted/20 rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {CARD_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={createCardMutation.isPending || newCardLastFour.length !== 4}
                  className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {createCardMutation.isPending ? 'Adding...' : 'Add Card'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setNewCardLastFour(''); setNewCardName(''); setNewCardType('visa') }}
                  className="px-4 py-2 text-text-muted text-sm hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Card Count */}
        <div className="bg-surface border border-text-muted/10 rounded-xl p-5 flex flex-col items-center justify-center text-center">
          <div className="text-4xl font-bold text-primary mb-1">{creditCards.length}</div>
          <p className="text-sm text-text-muted">Cards Added</p>
        </div>

        {/* Cards Section Header */}
        {creditCards.length > 0 && (
          <div className="md:col-span-2 lg:col-span-3 pt-2">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="w-4 h-4 text-text-muted" />
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Your Cards</h4>
            </div>
          </div>
        )}

        {/* Card List as Bento Cards */}
        {isLoading ? (
          <div className="md:col-span-2 lg:col-span-3 text-sm text-text-muted text-center py-8">Loading cards...</div>
        ) : creditCards.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 bg-surface border border-text-muted/10 rounded-xl p-8 text-center">
            <CreditCardIcon className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
            <p className="text-sm text-text-muted">No credit cards added yet</p>
            <p className="text-xs text-text-muted/70 mt-1">Add a card above or import a credit card statement</p>
          </div>
        ) : (
          creditCards.map((card) => {
            const color = getCardColor(card.card_type || 'other')
            return (
              <div
                key={card.id}
                className="bg-surface border border-text-muted/10 rounded-xl p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 bg-${color}-500/10 rounded-lg`}>
                    <CreditCardIcon className={`w-5 h-5 text-${color}-500`} />
                  </div>
                  {editingCardId !== card.id && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(card.id, card.card_name)}
                        className="p-1.5 text-text-muted hover:text-text rounded-lg hover:bg-text-muted/10 transition-colors"
                        title="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCard(card.id, card.card_name || `****${card.card_last_four}`)}
                        disabled={deleteCardMutation.isPending}
                        className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                {editingCardId === card.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingCardName}
                      onChange={(e) => setEditingCardName(e.target.value)}
                      placeholder="Card name"
                      className="flex-1 px-2 py-1.5 bg-background/50 border border-text-muted/20 rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(card.id)}
                      disabled={updateCardMutation.isPending}
                      className="p-1.5 text-green-400 hover:text-green-300 transition-colors"
                    >
                      <CheckIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="p-1.5 text-text-muted hover:text-text transition-colors"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-text">
                      {card.card_name || `Card ****${card.card_last_four}`}
                    </h3>
                    <p className="text-xs text-text-muted mt-1">
                      {getCardTypeLabel(card.card_type || 'other')} •••• {card.card_last_four}
                    </p>
                  </>
                )}
              </div>
            )
          })
        )}

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
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px focus:outline-none ${
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
