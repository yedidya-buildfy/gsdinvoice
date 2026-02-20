export interface InvoiceFilterState {
  search: string
  dateFrom: string
  dateTo: string
  fileTypes: string[] // 'pdf' | 'xlsx' | 'csv' | 'image'
  aiStatus: 'all' | 'pending' | 'processing' | 'processed' | 'failed'
  bankLinkStatus: 'all' | 'yes' | 'partly' | 'no'
  approvalStatus: 'all' | 'approved' | 'not_approved'
  source: 'all' | 'upload' | 'email'
}

export function getDefaultInvoiceFilters(): InvoiceFilterState {
  return {
    search: '',
    dateFrom: '',
    dateTo: '',
    fileTypes: [],
    aiStatus: 'all',
    bankLinkStatus: 'all',
    approvalStatus: 'all',
    source: 'all',
  }
}
