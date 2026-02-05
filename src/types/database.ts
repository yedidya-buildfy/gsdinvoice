export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string
          table_name: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id: string
          table_name: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      cc_bank_match_results: {
        Row: {
          bank_amount_agorot: number
          bank_charge_id: string | null
          bank_transaction_id: string
          card_last_four: string
          cc_transaction_count: number
          charge_date: string
          created_at: string | null
          discrepancy_agorot: number
          discrepancy_percent: number | null
          id: string
          match_confidence: number
          status: string | null
          team_id: string | null
          total_cc_amount_agorot: number
          user_id: string
        }
        Insert: {
          bank_amount_agorot: number
          bank_charge_id?: string | null
          bank_transaction_id: string
          card_last_four: string
          cc_transaction_count: number
          charge_date: string
          created_at?: string | null
          discrepancy_agorot: number
          discrepancy_percent?: number | null
          id?: string
          match_confidence: number
          status?: string | null
          team_id?: string | null
          total_cc_amount_agorot: number
          user_id: string
        }
        Update: {
          bank_amount_agorot?: number
          bank_charge_id?: string | null
          bank_transaction_id?: string
          card_last_four?: string
          cc_transaction_count?: number
          charge_date?: string
          created_at?: string | null
          discrepancy_agorot?: number
          discrepancy_percent?: number | null
          id?: string
          match_confidence?: number
          status?: string | null
          team_id?: string | null
          total_cc_amount_agorot?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cc_bank_match_results_bank_charge_id_fkey"
            columns: ["bank_charge_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_bank_match_results_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_bank_match_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          card_last_four: string
          card_name: string | null
          card_type: string | null
          created_at: string | null
          id: string
          team_id: string | null
          user_id: string
        }
        Insert: {
          card_last_four: string
          card_name?: string | null
          card_type?: string | null
          created_at?: string | null
          id?: string
          team_id?: string | null
          user_id: string
        }
        Update: {
          card_last_four?: string
          card_name?: string | null
          card_type?: string | null
          created_at?: string | null
          id?: string
          team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string | null
          error_message: string | null
          extracted_data: Json | null
          file_hash: string | null
          file_size: number | null
          file_type: string
          id: string
          original_name: string
          processed_at: string | null
          source_type: string
          status: string | null
          storage_path: string
          team_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          file_hash?: string | null
          file_size?: number | null
          file_type: string
          id?: string
          original_name: string
          processed_at?: string | null
          source_type: string
          status?: string | null
          storage_path: string
          team_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          file_hash?: string | null
          file_size?: number | null
          file_type?: string
          id?: string
          original_name?: string
          processed_at?: string | null
          source_type?: string
          status?: string | null
          storage_path?: string
          team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_rows: {
        Row: {
          allocation_amount_agorot: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          invoice_id: string
          is_document_link: boolean | null
          match_confidence: number | null
          match_method: string | null
          match_status: string | null
          matched_at: string | null
          normalized_description: string | null
          quantity: number | null
          reference_id: string | null
          total_agorot: number | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price_agorot: number | null
          vat_amount_agorot: number | null
          vat_rate: number | null
        }
        Insert: {
          allocation_amount_agorot?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          invoice_id: string
          is_document_link?: boolean | null
          match_confidence?: number | null
          match_method?: string | null
          match_status?: string | null
          matched_at?: string | null
          normalized_description?: string | null
          quantity?: number | null
          reference_id?: string | null
          total_agorot?: number | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price_agorot?: number | null
          vat_amount_agorot?: number | null
          vat_rate?: number | null
        }
        Update: {
          allocation_amount_agorot?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          invoice_id?: string
          is_document_link?: boolean | null
          match_confidence?: number | null
          match_method?: string | null
          match_status?: string | null
          matched_at?: string | null
          normalized_description?: string | null
          quantity?: number | null
          reference_id?: string | null
          total_agorot?: number | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price_agorot?: number | null
          vat_amount_agorot?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_rows_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_rows_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          currency: string | null
          due_date: string | null
          file_id: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          is_income: boolean | null
          status: string | null
          subtotal_agorot: number | null
          team_id: string | null
          total_amount_agorot: number | null
          user_id: string
          vat_amount_agorot: number | null
          vendor_name: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          file_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_income?: boolean | null
          status?: string | null
          subtotal_agorot?: number | null
          team_id?: string | null
          total_amount_agorot?: number | null
          user_id: string
          vat_amount_agorot?: number | null
          vendor_name?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          file_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_income?: boolean | null
          status?: string | null
          subtotal_agorot?: number | null
          team_id?: string | null
          total_amount_agorot?: number | null
          user_id?: string
          vat_amount_agorot?: number | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_vat_preferences: {
        Row: {
          created_at: string | null
          has_vat: boolean
          id: string
          merchant_name: string
          team_id: string | null
          updated_at: string | null
          user_id: string
          vat_percentage: number
        }
        Insert: {
          created_at?: string | null
          has_vat?: boolean
          id?: string
          merchant_name: string
          team_id?: string | null
          updated_at?: string | null
          user_id: string
          vat_percentage?: number
        }
        Update: {
          created_at?: string | null
          has_vat?: boolean
          id?: string
          merchant_name?: string
          team_id?: string | null
          updated_at?: string | null
          user_id?: string
          vat_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "merchant_vat_preferences_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_address: string | null
          company_name: string | null
          created_at: string | null
          currency: string | null
          date_format: string | null
          email_bank_sync_alerts: boolean | null
          email_new_invoice: boolean | null
          email_payment_received: boolean | null
          email_weekly_summary: boolean | null
          full_name: string | null
          id: string
          number_format: string | null
          tax_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_address?: string | null
          company_name?: string | null
          created_at?: string | null
          currency?: string | null
          date_format?: string | null
          email_bank_sync_alerts?: boolean | null
          email_new_invoice?: boolean | null
          email_payment_received?: boolean | null
          email_weekly_summary?: boolean | null
          full_name?: string | null
          id?: string
          number_format?: string | null
          tax_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_address?: string | null
          company_name?: string | null
          created_at?: string | null
          currency?: string | null
          date_format?: string | null
          email_bank_sync_alerts?: boolean | null
          email_new_invoice?: boolean | null
          email_payment_received?: boolean | null
          email_weekly_summary?: boolean | null
          full_name?: string | null
          id?: string
          number_format?: string | null
          tax_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      team_audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          metadata: Json | null
          target_user_id: string | null
          team_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
          team_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          status: string
          team_id: string
          token: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          team_id: string
          token: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string | null
          removed_at: string | null
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          removed_at?: string | null
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          removed_at?: string | null
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_agorot: number
          balance_agorot: number | null
          channel: string | null
          created_at: string | null
          credit_card_id: string | null
          date: string
          description: string
          foreign_amount_cents: number | null
          foreign_currency: string | null
          has_vat: boolean | null
          hash: string | null
          id: string
          is_credit_card_charge: boolean | null
          is_income: boolean
          linked_credit_card_id: string | null
          match_confidence: number | null
          match_status: string | null
          normalized_description: string | null
          parent_bank_charge_id: string | null
          reference: string | null
          source_file_id: string | null
          team_id: string | null
          transaction_type: string | null
          user_id: string
          value_date: string | null
          vat_amount_agorot: number | null
          vat_percentage: number | null
        }
        Insert: {
          amount_agorot: number
          balance_agorot?: number | null
          channel?: string | null
          created_at?: string | null
          credit_card_id?: string | null
          date: string
          description: string
          foreign_amount_cents?: number | null
          foreign_currency?: string | null
          has_vat?: boolean | null
          hash?: string | null
          id?: string
          is_credit_card_charge?: boolean | null
          is_income?: boolean
          linked_credit_card_id?: string | null
          match_confidence?: number | null
          match_status?: string | null
          normalized_description?: string | null
          parent_bank_charge_id?: string | null
          reference?: string | null
          source_file_id?: string | null
          team_id?: string | null
          transaction_type?: string | null
          user_id: string
          value_date?: string | null
          vat_amount_agorot?: number | null
          vat_percentage?: number | null
        }
        Update: {
          amount_agorot?: number
          balance_agorot?: number | null
          channel?: string | null
          created_at?: string | null
          credit_card_id?: string | null
          date?: string
          description?: string
          foreign_amount_cents?: number | null
          foreign_currency?: string | null
          has_vat?: boolean | null
          hash?: string | null
          id?: string
          is_credit_card_charge?: boolean | null
          is_income?: boolean
          linked_credit_card_id?: string | null
          match_confidence?: number | null
          match_status?: string | null
          normalized_description?: string | null
          parent_bank_charge_id?: string | null
          reference?: string | null
          source_file_id?: string | null
          team_id?: string | null
          transaction_type?: string | null
          user_id?: string
          value_date?: string | null
          vat_amount_agorot?: number | null
          vat_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_linked_credit_card_id_fkey"
            columns: ["linked_credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_bank_charge_id_fkey"
            columns: ["parent_bank_charge_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          auto_approval_threshold: number | null
          created_at: string | null
          id: string
          matching_trigger: string | null
          team_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_approval_threshold?: number | null
          created_at?: string | null
          id?: string
          matching_trigger?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_approval_threshold?: number | null
          created_at?: string | null
          id?: string
          matching_trigger?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_aliases: {
        Row: {
          id: string
          user_id: string
          team_id: string | null
          alias_pattern: string
          canonical_name: string
          match_type: 'exact' | 'contains' | 'starts_with' | 'ends_with'
          source: 'system' | 'user' | 'learned'
          priority: number
          default_has_vat: boolean | null
          default_vat_percentage: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          team_id?: string | null
          alias_pattern: string
          canonical_name: string
          match_type?: 'exact' | 'contains' | 'starts_with' | 'ends_with'
          source?: 'system' | 'user' | 'learned'
          priority?: number
          default_has_vat?: boolean | null
          default_vat_percentage?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          team_id?: string | null
          alias_pattern?: string
          canonical_name?: string
          default_has_vat?: boolean | null
          default_vat_percentage?: number | null
          match_type?: 'exact' | 'contains' | 'starts_with' | 'ends_with'
          source?: 'system' | 'user' | 'learned'
          priority?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_aliases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_aliases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_team_invitation: {
        Args: { p_token: string; p_user_email: string; p_user_id: string }
        Returns: Json
      }
      bulk_delete_files: { Args: { ids: string[] }; Returns: number }
      bulk_delete_transactions: { Args: { ids: string[] }; Returns: number }
      bulk_get_invoice_row_transaction_ids: {
        Args: { transaction_ids: string[] }
        Returns: {
          transaction_id: string
        }[]
      }
      bulk_update_transactions: {
        Args: { ids: string[]; update_data: Json }
        Returns: number
      }
      can_create_business: { Args: Record<PropertyKey, never>; Returns: boolean }
      check_invitation_rate_limit: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      create_personal_team: {
        Args: { p_team_name?: string; p_user_id: string }
        Returns: string
      }
      generate_team_slug: { Args: { team_name: string }; Returns: string }
      get_user_team_role: { Args: { check_team_id: string }; Returns: string }
      is_active_team_member: {
        Args: { check_team_id: string }
        Returns: boolean
      }
      is_team_admin: { Args: { check_team_id: string }; Returns: boolean }
      seed_default_vendor_aliases: {
        Args: { p_user_id: string; p_team_id?: string | null }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ============================================================================
// Convenience types for row data
// ============================================================================

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

export type CCBankMatchResult = Database['public']['Tables']['cc_bank_match_results']['Row']
export type CCBankMatchResultInsert = Database['public']['Tables']['cc_bank_match_results']['Insert']
export type CCBankMatchResultUpdate = Database['public']['Tables']['cc_bank_match_results']['Update']

// Profile types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

// Currency type - imported from centralized currency module
// Supports all ISO 4217 currencies via currency-codes-ts
import type { CurrencyCode } from '@/lib/currency'
export type Currency = CurrencyCode
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
export type NumberFormat = 'comma_dot' | 'space_comma' | 'dot_comma'

// Transaction type enum for the simplified CC schema
export type TransactionType = 'bank_regular' | 'bank_cc_charge' | 'cc_purchase'

// Vendor alias types
export type VendorAlias = Database['public']['Tables']['vendor_aliases']['Row']
export type VendorAliasInsert = Database['public']['Tables']['vendor_aliases']['Insert']
export type VendorAliasUpdate = Database['public']['Tables']['vendor_aliases']['Update']
