export interface InvoiceFilterState {
  search: string
  dateFrom: string
  dateTo: string
  fileTypes: string[] // 'pdf' | 'xlsx' | 'csv' | 'image'
  aiStatus: 'all' | 'pending' | 'processing' | 'processed' | 'failed'
  bankLinkStatus: 'all' | 'yes' | 'partly' | 'no'
}

export function getDefaultInvoiceFilters(): InvoiceFilterState {
  return {
    search: '',
    dateFrom: '',
    dateTo: '',
    fileTypes: [],
    aiStatus: 'all',
    bankLinkStatus: 'all',
  }
}
