import { useState } from 'react'
import {
  EnvelopeIcon,
  ArrowPathIcon,
  TrashIcon,
  PlusIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import {
  useEmailConnections,
  useConnectGmail,
  useDisconnectGmail,
  useStartEmailSync,
  useUpdateSenderRules,
} from '@/hooks/useEmailConnections'
import { ConfirmDialog } from '@/components/ui/base/modal/confirm-dialog'
import type { EmailConnection } from '@/types/database'

interface SenderRule {
  domain: string
  rule: 'always_trust' | 'always_ignore'
}

function SyncStateDisplay({ connection }: { connection: EmailConnection }) {
  const syncState = connection.sync_state as Record<string, unknown> | null
  if (!syncState) return null

  const syncStatus = syncState.status as string | undefined
  const emailsChecked = (syncState.emails_checked as number) ?? 0
  const totalEstimated = (syncState.total_emails_estimated as number) ?? 0
  const receiptsFound = (syncState.receipts_found as number) ?? 0
  const progress = totalEstimated > 0 ? Math.round((emailsChecked / totalEstimated) * 100) : 0

  if (syncStatus === 'completed') {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
        <CheckCircleIcon className="w-4 h-4 text-green-400" />
        <span>Scan complete: {emailsChecked} emails checked, {receiptsFound} receipts found</span>
      </div>
    )
  }

  if (syncStatus !== 'syncing') return null

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Scanning emails... {emailsChecked} / {totalEstimated}</span>
        <span>{receiptsFound} receipts found</span>
      </div>
      <div className="w-full bg-background rounded-full h-1.5">
        <div
          className="bg-primary h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  )
}

function ConnectionCard({
  connection,
  onDisconnect,
  onSync,
  onManageRules,
}: {
  connection: EmailConnection
  onDisconnect: () => void
  onSync: () => void
  onManageRules: () => void
}) {
  const statusColors: Record<string, string> = {
    active: 'text-green-400',
    syncing: 'text-yellow-400',
    expired: 'text-red-400',
    revoked: 'text-red-400',
  }

  const statusLabels: Record<string, string> = {
    active: 'Connected',
    syncing: 'Syncing',
    expired: 'Expired',
    revoked: 'Revoked',
  }

  return (
    <div className="rounded-lg border border-text-muted/20 bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <EnvelopeIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-text">{connection.email_address}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs ${statusColors[connection.status] ?? 'text-text-muted'}`}>
                {statusLabels[connection.status] ?? connection.status}
              </span>
              {connection.last_sync_at && (
                <span className="text-xs text-text-muted">
                  Last sync: {new Date(connection.last_sync_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(connection.status === 'active' || connection.status === 'syncing') && (
            <button
              type="button"
              onClick={onSync}
              disabled={connection.status === 'syncing'}
              className="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={connection.status === 'syncing' ? 'Sync in progress' : 'Resync emails'}
            >
              <ArrowPathIcon className={`w-4 h-4 ${connection.status === 'syncing' ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={onManageRules}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors"
            title="Sender rules"
          >
            <ShieldCheckIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="p-2 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Disconnect"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      <SyncStateDisplay connection={connection} />
    </div>
  )
}

function SenderRulesModal({
  connection,
  onClose,
}: {
  connection: EmailConnection
  onClose: () => void
}) {
  const updateRules = useUpdateSenderRules()
  const existingRules = (connection.sender_rules ?? []) as unknown as SenderRule[]
  const [rules, setRules] = useState<SenderRule[]>(existingRules)
  const [newDomain, setNewDomain] = useState('')
  const [newRule, setNewRule] = useState<'always_trust' | 'always_ignore'>('always_trust')

  const handleAdd = () => {
    const domain = newDomain.trim().toLowerCase()
    if (!domain || rules.some(r => r.domain === domain)) return
    setRules([...rules, { domain, rule: newRule }])
    setNewDomain('')
  }

  const handleRemove = (domain: string) => {
    setRules(rules.filter(r => r.domain !== domain))
  }

  const handleSave = () => {
    updateRules.mutate(
      { connectionId: connection.id, senderRules: rules },
      { onSuccess: onClose }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-xl border border-text-muted/20 shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-text-muted/20">
          <h3 className="text-lg font-semibold text-text">Sender Rules</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-background">
            <XMarkIcon className="w-5 h-5 text-text-muted" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-muted">
            Configure which email senders to always trust or always ignore when scanning for receipts.
          </p>

          {/* Existing rules */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {rules.map((rule) => (
              <div key={rule.domain} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    rule.rule === 'always_trust'
                      ? 'bg-green-400/10 text-green-400'
                      : 'bg-red-400/10 text-red-400'
                  }`}>
                    {rule.rule === 'always_trust' ? 'Trust' : 'Ignore'}
                  </span>
                  <span className="text-sm text-text">{rule.domain}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(rule.domain)}
                  className="p-1 rounded hover:bg-surface text-text-muted hover:text-red-400"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
            {rules.length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No sender rules configured</p>
            )}
          </div>

          {/* Add new rule */}
          <div className="flex items-center gap-2">
            <select
              value={newRule}
              onChange={(e) => setNewRule(e.target.value as 'always_trust' | 'always_ignore')}
              className="px-2 py-1.5 bg-background border border-text-muted/20 rounded-lg text-text text-sm"
            >
              <option value="always_trust">Trust</option>
              <option value="always_ignore">Ignore</option>
            </select>
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="e.g. paypal.com"
              className="flex-1 px-3 py-1.5 bg-background border border-text-muted/20 rounded-lg text-text text-sm placeholder:text-text-muted"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newDomain.trim()}
              className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/80 disabled:opacity-50 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-text-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={updateRules.isPending}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            {updateRules.isPending ? 'Saving...' : 'Save Rules'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SyncStartModal({
  connection,
  onClose,
  onStart,
  isPending,
}: {
  connection: EmailConnection
  onClose: () => void
  onStart: (dateFrom: string, dateTo: string) => void
  isPending: boolean
}) {
  const currentYear = new Date().getFullYear()
  const [dateFrom, setDateFrom] = useState(`${currentYear}-01-01`)
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-xl border border-text-muted/20 shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between p-4 border-b border-text-muted/20">
          <h3 className="text-lg font-semibold text-text">Start Email Scan</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-background">
            <XMarkIcon className="w-5 h-5 text-text-muted" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-muted">
            Scan <strong className="text-text">{connection.email_address}</strong> for receipts and invoices.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-1.5 bg-background border border-text-muted/20 rounded-lg text-text text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-1.5 bg-background border border-text-muted/20 rounded-lg text-text text-sm"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-text-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onStart(dateFrom, dateTo)}
            disabled={isPending}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Starting...' : 'Start Scan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function EmailConnectionsSection() {
  const { data: connections, isLoading } = useEmailConnections()
  const connectGmail = useConnectGmail()
  const disconnectGmail = useDisconnectGmail()
  const startSync = useStartEmailSync()

  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null)
  const [rulesTarget, setRulesTarget] = useState<EmailConnection | null>(null)
  const [syncTarget, setSyncTarget] = useState<EmailConnection | null>(null)

  const handleDisconnect = () => {
    if (!disconnectTarget) return
    disconnectGmail.mutate(disconnectTarget, {
      onSuccess: () => setDisconnectTarget(null),
    })
  }

  const handleStartSync = (dateFrom: string, dateTo: string) => {
    if (!syncTarget) return
    startSync.mutate(
      { connectionId: syncTarget.id, dateFrom, dateTo },
      { onSuccess: () => setSyncTarget(null) }
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text">Email Connections</h3>
          <p className="text-sm text-text-muted mt-1">
            Connect your Gmail to automatically scan for receipts and invoices.
          </p>
        </div>
        <button
          type="button"
          onClick={() => connectGmail.mutate()}
          disabled={connectGmail.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors text-sm"
        >
          <PlusIcon className="w-4 h-4" />
          {connectGmail.isPending ? 'Connecting...' : 'Connect Gmail'}
        </button>
      </div>

      {connectGmail.isError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-400/10 border border-red-400/20">
          <ExclamationCircleIcon className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{connectGmail.error.message}</p>
        </div>
      )}

      {/* Connections list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <ArrowPathIcon className="w-6 h-6 text-text-muted animate-spin" />
        </div>
      ) : connections && connections.length > 0 ? (
        <div className="space-y-3">
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              onDisconnect={() => setDisconnectTarget(conn.id)}
              onSync={() => setSyncTarget(conn)}
              onManageRules={() => setRulesTarget(conn)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 rounded-lg border border-dashed border-text-muted/20">
          <EnvelopeIcon className="w-12 h-12 text-text-muted/40 mx-auto mb-3" />
          <p className="text-sm text-text-muted">No email accounts connected</p>
          <p className="text-xs text-text-muted/60 mt-1">
            Connect your Gmail to start scanning for receipts automatically.
          </p>
        </div>
      )}

      {/* Info box */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/10">
        <CheckCircleIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-text-muted">
          <p className="font-medium text-text">How it works</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            <li>We use read-only access to scan your inbox for receipts</li>
            <li>AI classifies emails and extracts receipt data</li>
            <li>Found receipts appear in your Invoices page for review</li>
            <li>New emails are monitored in real-time via push notifications</li>
          </ul>
        </div>
      </div>

      {/* Disconnect confirmation */}
      {disconnectTarget && (
        <ConfirmDialog
          isOpen
          title="Disconnect Email"
          message="Are you sure you want to disconnect this email account? Previously imported receipts will be kept."
          confirmLabel="Disconnect"
          variant="danger"
          onConfirm={handleDisconnect}
          onCancel={() => setDisconnectTarget(null)}
        />
      )}

      {/* Sender rules modal */}
      {rulesTarget && (
        <SenderRulesModal
          connection={rulesTarget}
          onClose={() => setRulesTarget(null)}
        />
      )}

      {/* Sync start modal */}
      {syncTarget && (
        <SyncStartModal
          connection={syncTarget}
          onClose={() => setSyncTarget(null)}
          onStart={handleStartSync}
          isPending={startSync.isPending}
        />
      )}
    </div>
  )
}
