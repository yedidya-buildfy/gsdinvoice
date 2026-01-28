export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      user_settings: {
        Row: {
          id: string
          user_id: string
          matching_trigger: string
          auto_approval_threshold: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          matching_trigger?: string
          auto_approval_threshold?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          matching_trigger?: string
          auto_approval_threshold?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      files: {
        Row: {
          id: string
          user_id: string
          storage_path: string
          file_type: string
          source_type: string
          original_name: string
          file_size: number
          status: string
          extracted_data: Json | null
          error_message: string | null
          created_at: string
          processed_at: string | null
          file_hash: string | null
        }
        Insert: {
          id?: string
          user_id: string
          storage_path: string
          file_type: string
          source_type: string
          original_name: string
          file_size: number
          status?: string
          extracted_data?: Json | null
          error_message?: string | null
          created_at?: string
          processed_at?: string | null
          file_hash?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          storage_path?: string
          file_type?: string
          source_type?: string
          original_name?: string
          file_size?: number
          status?: string
          extracted_data?: Json | null
          error_message?: string | null
          created_at?: string
          processed_at?: string | null
          file_hash?: string | null
        }
        Relationships: []
      }
      credit_cards: {
        Row: {
          id: string
          user_id: string
          card_last_four: string
          card_name: string | null
          card_type: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          card_last_four: string
          card_name?: string | null
          card_type?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          card_last_four?: string
          card_name?: string | null
          card_type?: string
          created_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          date: string
          value_date: string | null
          description: string
          reference: string | null
          amount_agorot: number
          balance_agorot: number | null
          is_income: boolean
          is_credit_card_charge: boolean
          linked_credit_card_id: string | null
          channel: string | null
          source_file_id: string | null
          hash: string | null
          match_status: string
          foreign_amount_cents: number | null
          foreign_currency: string | null
          has_vat: boolean
          vat_percentage: number
          vat_amount_agorot: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          value_date?: string | null
          description: string
          reference?: string | null
          amount_agorot: number
          balance_agorot?: number | null
          is_income?: boolean
          is_credit_card_charge?: boolean
          linked_credit_card_id?: string | null
          channel?: string | null
          source_file_id?: string | null
          hash?: string | null
          match_status?: string
          foreign_amount_cents?: number | null
          foreign_currency?: string | null
          has_vat?: boolean
          vat_percentage?: number
          vat_amount_agorot?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          value_date?: string | null
          description?: string
          reference?: string | null
          amount_agorot?: number
          balance_agorot?: number | null
          is_income?: boolean
          is_credit_card_charge?: boolean
          linked_credit_card_id?: string | null
          channel?: string | null
          source_file_id?: string | null
          hash?: string | null
          match_status?: string
          foreign_amount_cents?: number | null
          foreign_currency?: string | null
          has_vat?: boolean
          vat_percentage?: number
          vat_amount_agorot?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'transactions_linked_credit_card_id_fkey'
            columns: ['linked_credit_card_id']
            referencedRelation: 'credit_cards'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transactions_source_file_id_fkey'
            columns: ['source_file_id']
            referencedRelation: 'files'
            referencedColumns: ['id']
          }
        ]
      }
      invoices: {
        Row: {
          id: string
          user_id: string
          file_id: string | null
          vendor_name: string | null
          invoice_number: string | null
          invoice_date: string | null
          due_date: string | null
          subtotal_agorot: number | null
          vat_amount_agorot: number | null
          total_amount_agorot: number | null
          currency: string
          confidence_score: number | null
          status: string
          is_income: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          file_id?: string | null
          vendor_name?: string | null
          invoice_number?: string | null
          invoice_date?: string | null
          due_date?: string | null
          subtotal_agorot?: number | null
          vat_amount_agorot?: number | null
          total_amount_agorot?: number | null
          currency?: string
          confidence_score?: number | null
          status?: string
          is_income?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          file_id?: string | null
          vendor_name?: string | null
          invoice_number?: string | null
          invoice_date?: string | null
          due_date?: string | null
          subtotal_agorot?: number | null
          vat_amount_agorot?: number | null
          total_amount_agorot?: number | null
          currency?: string
          confidence_score?: number | null
          status?: string
          is_income?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoices_file_id_fkey'
            columns: ['file_id']
            referencedRelation: 'files'
            referencedColumns: ['id']
          }
        ]
      }
      invoice_rows: {
        Row: {
          id: string
          invoice_id: string
          description: string | null
          quantity: number | null
          unit_price_agorot: number | null
          total_agorot: number | null
          transaction_id: string | null
          allocation_amount_agorot: number | null
          reference_id: string | null
          transaction_date: string | null
          currency: string
          vat_rate: number | null
          vat_amount_agorot: number | null
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          description?: string | null
          quantity?: number | null
          unit_price_agorot?: number | null
          total_agorot?: number | null
          transaction_id?: string | null
          allocation_amount_agorot?: number | null
          reference_id?: string | null
          transaction_date?: string | null
          currency?: string
          vat_rate?: number | null
          vat_amount_agorot?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          description?: string | null
          quantity?: number | null
          unit_price_agorot?: number | null
          total_agorot?: number | null
          transaction_id?: string | null
          allocation_amount_agorot?: number | null
          reference_id?: string | null
          transaction_date?: string | null
          currency?: string
          vat_rate?: number | null
          vat_amount_agorot?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_rows_invoice_id_fkey'
            columns: ['invoice_id']
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_rows_transaction_id_fkey'
            columns: ['transaction_id']
            referencedRelation: 'transactions'
            referencedColumns: ['id']
          }
        ]
      }
      audit_log: {
        Row: {
          id: string
          table_name: string
          record_id: string
          operation: string
          old_data: Json | null
          new_data: Json | null
          changed_by: string | null
          changed_at: string
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          operation: string
          old_data?: Json | null
          new_data?: Json | null
          changed_by?: string | null
          changed_at?: string
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string
          operation?: string
          old_data?: Json | null
          new_data?: Json | null
          changed_by?: string | null
          changed_at?: string
        }
        Relationships: []
      }
      merchant_vat_preferences: {
        Row: {
          id: string
          user_id: string
          merchant_name: string
          has_vat: boolean
          vat_percentage: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          merchant_name: string
          has_vat?: boolean
          vat_percentage?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          merchant_name?: string
          has_vat?: boolean
          vat_percentage?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience types for row data
export type UserSettings = Database['public']['Tables']['user_settings']['Row']
export type File = Database['public']['Tables']['files']['Row']
export type CreditCard = Database['public']['Tables']['credit_cards']['Row']
export type Transaction = Database['public']['Tables']['transactions']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type InvoiceRow = Database['public']['Tables']['invoice_rows']['Row']
export type AuditLog = Database['public']['Tables']['audit_log']['Row']

// Insert types
export type UserSettingsInsert = Database['public']['Tables']['user_settings']['Insert']
export type FileInsert = Database['public']['Tables']['files']['Insert']
export type CreditCardInsert = Database['public']['Tables']['credit_cards']['Insert']
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert']
export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
export type InvoiceRowInsert = Database['public']['Tables']['invoice_rows']['Insert']
export type AuditLogInsert = Database['public']['Tables']['audit_log']['Insert']

// Update types
export type UserSettingsUpdate = Database['public']['Tables']['user_settings']['Update']
export type FileUpdate = Database['public']['Tables']['files']['Update']
export type CreditCardUpdate = Database['public']['Tables']['credit_cards']['Update']
export type TransactionUpdate = Database['public']['Tables']['transactions']['Update']
export type InvoiceUpdate = Database['public']['Tables']['invoices']['Update']
export type InvoiceRowUpdate = Database['public']['Tables']['invoice_rows']['Update']
export type AuditLogUpdate = Database['public']['Tables']['audit_log']['Update']

export type MerchantVatPreference = Database['public']['Tables']['merchant_vat_preferences']['Row']
export type MerchantVatPreferenceInsert = Database['public']['Tables']['merchant_vat_preferences']['Insert']
export type MerchantVatPreferenceUpdate = Database['public']['Tables']['merchant_vat_preferences']['Update']
