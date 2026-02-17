export type DocumentExportFormat = 'zip' | 'merged-pdf' | 'individual'

export type ExportProgress = {
  status: 'idle' | 'preparing' | 'downloading' | 'processing' | 'complete' | 'error'
  currentStep: string
  progress: number // 0-100
  error?: string
}
