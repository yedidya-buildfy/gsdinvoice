import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ExportProgress } from '@/lib/export/types'

const INITIAL_PROGRESS: ExportProgress = {
  status: 'idle',
  currentStep: '',
  progress: 0,
}

export function useExport() {
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState<ExportProgress>(INITIAL_PROGRESS)
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    setProgress(INITIAL_PROGRESS)
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setProgress({
      status: 'idle',
      currentStep: 'Cancelled',
      progress: 0,
    })
  }, [])

  const runExport = useCallback(
    async (exportFn: (onProgress: (p: ExportProgress) => void, signal: AbortSignal) => Promise<void>) => {
      const controller = new AbortController()
      abortRef.current = controller

      setProgress({
        status: 'preparing',
        currentStep: 'Starting export...',
        progress: 0,
      })

      try {
        await exportFn(setProgress, controller.signal)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setProgress({
          status: 'error',
          currentStep: 'Export failed',
          progress: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      } finally {
        abortRef.current = null
      }
    },
    []
  )

  const markExported = useCallback(
    async (table: 'files' | 'invoices' | 'transactions', ids: string[]) => {
      if (ids.length === 0) return

      const { error } = await supabase
        .from(table)
        .update({ exported_at: new Date().toISOString() })
        .in('id', ids)

      if (error) {
        console.error(`[useExport] Failed to mark ${table} as exported:`, error)
        return
      }

      // Invalidate relevant queries so UI refreshes
      const keyMap = {
        files: 'documents',
        invoices: 'invoices',
        transactions: 'transactions',
      }
      queryClient.invalidateQueries({ queryKey: [keyMap[table]] })
    },
    [queryClient]
  )

  return {
    progress,
    isExporting: progress.status !== 'idle' && progress.status !== 'complete' && progress.status !== 'error',
    runExport,
    markExported,
    cancel,
    reset,
  }
}
