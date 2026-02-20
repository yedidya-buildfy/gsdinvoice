import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { useEmailSyncProgress } from '@/hooks/useEmailConnections'

export function EmailSyncProgress() {
  const { data: activeSyncs } = useEmailSyncProgress()

  if (!activeSyncs || activeSyncs.length === 0) return null

  return (
    <div className="space-y-2 px-6 pt-4">
      {activeSyncs.map((sync) => {
        const syncState = sync.sync_state as Record<string, unknown> | null
        const emailsChecked = (syncState?.emails_checked as number) ?? 0
        const totalEstimated = (syncState?.total_emails_estimated as number) ?? 0
        const receiptsFound = (syncState?.receipts_found as number) ?? 0
        const progress = totalEstimated > 0 ? Math.round((emailsChecked / totalEstimated) * 100) : 0

        return (
          <div
            key={sync.id}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20"
          >
            <div className="shrink-0">
              <EnvelopeIcon className="w-5 h-5 text-primary animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text truncate">
                  Scanning <strong>{sync.email_address}</strong> for receipts...
                </span>
                <span className="text-text-muted text-xs shrink-0 ml-2">
                  {receiptsFound} found | {emailsChecked}/{totalEstimated} emails
                </span>
              </div>
              <div className="w-full bg-background rounded-full h-1 mt-1.5">
                <div
                  className="bg-primary h-1 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
