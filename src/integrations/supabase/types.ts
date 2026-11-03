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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      download_entitlements: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          max_downloads: number
          order_id: string
          order_item_file_id: string
          starts_at: string
          used_downloads: number
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          max_downloads?: number
          order_id: string
          order_item_file_id: string
          starts_at: string
          used_downloads?: number
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          max_downloads?: number
          order_id?: string
          order_item_file_id?: string
          starts_at?: string
          used_downloads?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_entitlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "download_entitlements_order_item_file_id_fkey"
            columns: ["order_item_file_id"]
            isOneToOne: true
            referencedRelation: "order_item_files"
            referencedColumns: ["id"]
          },
        ]
      }
      download_reservations: {
        Row: {
          closed_at: string | null
          created_at: string
          entitlement_id: string
          expires_at: string
          finalized_at: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          entitlement_id: string
          expires_at?: string
          finalized_at?: string | null
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          entitlement_id?: string
          expires_at?: string
          finalized_at?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_reservations_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "download_entitlements"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlement_renewals: {
        Row: {
          admin_id: string
          created_at: string
          entitlement_id: string
          extra_days: number
          extra_downloads: number
          id: string
          reason: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          entitlement_id: string
          extra_days: number
          extra_downloads: number
          id?: string
          reason: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          entitlement_id?: string
          extra_days?: number
          extra_downloads?: number
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_renewals_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "download_entitlements"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_files: {
        Row: {
          file_name: string
          file_version_id: string
          id: string
          order_item_id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          file_name: string
          file_version_id: string
          id?: string
          order_item_id: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          file_name?: string
          file_version_id?: string
          id?: string
          order_item_id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_files_file_version_id_fkey"
            columns: ["file_version_id"]
            isOneToOne: false
            referencedRelation: "product_file_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_files_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          commission_bps: number | null
          commission_millimes: number | null
          discount_millimes: number
          gross_millimes: number | null
          id: string
          order_id: string
          payable_millimes: number | null
          product_id: string
          product_name: string
          quantity: number
          seller_id: string | null
          seller_net_millimes: number | null
          store_id: string | null
          unit_price_millimes: number
        }
        Insert: {
          commission_bps?: number | null
          commission_millimes?: number | null
          discount_millimes?: number
          gross_millimes?: number | null
          id?: string
          order_id: string
          payable_millimes?: number | null
          product_id: string
          product_name: string
          quantity?: number
          seller_id?: string | null
          seller_net_millimes?: number | null
          store_id?: string | null
          unit_price_millimes: number
        }
        Update: {
          commission_bps?: number | null
          commission_millimes?: number | null
          discount_millimes?: number
          gross_millimes?: number | null
          id?: string
          order_id?: string
          payable_millimes?: number | null
          product_id?: string
          product_name?: string
          quantity?: number
          seller_id?: string | null
          seller_net_millimes?: number | null
          store_id?: string | null
          unit_price_millimes?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_amount_minor: number | null
          buyer_currency: string | null
          buyer_currency_exponent: number | null
          buyer_fx_quoted_at: string | null
          buyer_fx_rate: number | null
          buyer_fx_rate_source: string | null
          checkout_key: string
          created_at: string
          currency: string
          customer_email: string | null
          email_error: string | null
          email_sent_at: string | null
          id: string
          konnect_pay_url: string | null
          konnect_payment_ref: string | null
          paid_at: string | null
          payment_confirmation_ref: string | null
          payment_mode: string | null
          platform_settlement_amount_minor: number | null
          platform_settlement_currency: string
          platform_settlement_currency_exponent: number | null
          status: Database["public"]["Enums"]["order_status"]
          total_millimes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_amount_minor?: number | null
          buyer_currency?: string | null
          buyer_currency_exponent?: number | null
          buyer_fx_quoted_at?: string | null
          buyer_fx_rate?: number | null
          buyer_fx_rate_source?: string | null
          checkout_key: string
          created_at?: string
          currency?: string
          customer_email?: string | null
          email_error?: string | null
          email_sent_at?: string | null
          id?: string
          konnect_pay_url?: string | null
          konnect_payment_ref?: string | null
          paid_at?: string | null
          payment_confirmation_ref?: string | null
          payment_mode?: string | null
          platform_settlement_amount_minor?: number | null
          platform_settlement_currency?: string
          platform_settlement_currency_exponent?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          total_millimes: number
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_amount_minor?: number | null
          buyer_currency?: string | null
          buyer_currency_exponent?: number | null
          buyer_fx_quoted_at?: string | null
          buyer_fx_rate?: number | null
          buyer_fx_rate_source?: string | null
          checkout_key?: string
          created_at?: string
          currency?: string
          customer_email?: string | null
          email_error?: string | null
          email_sent_at?: string | null
          id?: string
          konnect_pay_url?: string | null
          konnect_payment_ref?: string | null
          paid_at?: string | null
          payment_confirmation_ref?: string | null
          payment_mode?: string | null
          platform_settlement_amount_minor?: number | null
          platform_settlement_currency?: string
          platform_settlement_currency_exponent?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          total_millimes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          id: string
          konnect_status: string | null
          order_id: string | null
          outcome: string
          payment_mode: string | null
          payment_ref: string
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          konnect_status?: string | null
          order_id?: string | null
          outcome: string
          payment_mode?: string | null
          payment_ref: string
          source: string
        }
        Update: {
          created_at?: string
          id?: string
          konnect_status?: string | null
          order_id?: string | null
          outcome?: string
          payment_mode?: string | null
          payment_ref?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_financial_ledger_entries: {
        Row: {
          accounting_amount_millimes: number
          accounting_currency: string
          created_at: string
          entry_side: string
          entry_type: string
          external_reference: string | null
          fx_rate: number | null
          fx_rate_at: string | null
          fx_rate_source: string | null
          id: string
          idempotency_key: string
          order_id: string | null
          order_item_id: string | null
          seller_id: string | null
          seller_payout_id: string | null
          source: string
          store_id: string | null
          transaction_amount_minor: number
          transaction_currency: string
          transaction_currency_exponent: number
        }
        Insert: {
          accounting_amount_millimes: number
          accounting_currency?: string
          created_at?: string
          entry_side: string
          entry_type: string
          external_reference?: string | null
          fx_rate?: number | null
          fx_rate_at?: string | null
          fx_rate_source?: string | null
          id?: string
          idempotency_key: string
          order_id?: string | null
          order_item_id?: string | null
          seller_id?: string | null
          seller_payout_id?: string | null
          source: string
          store_id?: string | null
          transaction_amount_minor: number
          transaction_currency: string
          transaction_currency_exponent: number
        }
        Update: {
          accounting_amount_millimes?: number
          accounting_currency?: string
          created_at?: string
          entry_side?: string
          entry_type?: string
          external_reference?: string | null
          fx_rate?: number | null
          fx_rate_at?: string | null
          fx_rate_source?: string | null
          id?: string
          idempotency_key?: string
          order_id?: string | null
          order_item_id?: string | null
          seller_id?: string | null
          seller_payout_id?: string | null
          source?: string
          store_id?: string | null
          transaction_amount_minor?: number
          transaction_currency?: string
          transaction_currency_exponent?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_financial_ledger_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_financial_ledger_entries_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_financial_ledger_entries_seller_payout_id_fkey"
            columns: ["seller_payout_id"]
            isOneToOne: false
            referencedRelation: "seller_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_financial_ledger_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          commission_bps: number
          id: boolean
          konnect_direct_payouts_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commission_bps?: number
          id?: boolean
          konnect_direct_payouts_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commission_bps?: number
          id?: boolean
          konnect_direct_payouts_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      product_file_versions: {
        Row: {
          activated_at: string | null
          archived_at: string | null
          created_at: string
          created_by: string
          file_name: string
          id: string
          mime_type: string
          product_id: string
          sha256: string | null
          size_bytes: number
          status: string
          storage_path: string
          store_id: string
        }
        Insert: {
          activated_at?: string | null
          archived_at?: string | null
          created_at?: string
          created_by: string
          file_name: string
          id?: string
          mime_type?: string
          product_id: string
          sha256?: string | null
          size_bytes: number
          status?: string
          storage_path: string
          store_id: string
        }
        Update: {
          activated_at?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string
          file_name?: string
          id?: string
          mime_type?: string
          product_id?: string
          sha256?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_file_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_file_versions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_files: {
        Row: {
          file_name: string
          file_path: string
          product_id: string
          updated_at: string
        }
        Insert: {
          file_name: string
          file_path: string
          product_id: string
          updated_at?: string
        }
        Update: {
          file_name?: string
          file_path?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_files_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          image_path: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_path: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          description_translations: Json
          id: string
          image_path: string | null
          is_active: boolean
          name: string
          name_translations: Json
          price_millimes: number
          product_type: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          description_translations?: Json
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          name_translations?: Json
          price_millimes: number
          product_type?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          description_translations?: Json
          id?: string
          image_path?: string | null
          is_active?: boolean
          name?: string
          name_translations?: Json
          price_millimes?: number
          product_type?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          phone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      seller_external_fee_entries: {
        Row: {
          amount_millimes: number
          created_at: string
          currency: string
          description: string
          external_reference: string
          fee_category: string
          id: string
          idempotency_key: string
          order_id: string | null
          order_item_id: string | null
          recorded_by: string
          seller_id: string
          source: string
          store_id: string
        }
        Insert: {
          amount_millimes: number
          created_at?: string
          currency?: string
          description: string
          external_reference: string
          fee_category: string
          id?: string
          idempotency_key: string
          order_id?: string | null
          order_item_id?: string | null
          recorded_by: string
          seller_id: string
          source: string
          store_id: string
        }
        Update: {
          amount_millimes?: number
          created_at?: string
          currency?: string
          description?: string
          external_reference?: string
          fee_category?: string
          id?: string
          idempotency_key?: string
          order_id?: string | null
          order_item_id?: string | null
          recorded_by?: string
          seller_id?: string
          source?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_external_fee_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_external_fee_entries_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_external_fee_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_ledger_entries: {
        Row: {
          amount_millimes: number
          created_at: string
          entry_type: string
          id: string
          order_item_id: string
          seller_id: string
          store_id: string
        }
        Insert: {
          amount_millimes: number
          created_at?: string
          entry_type: string
          id?: string
          order_item_id: string
          seller_id: string
          store_id: string
        }
        Update: {
          amount_millimes?: number
          created_at?: string
          entry_type?: string
          id?: string
          order_item_id?: string
          seller_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_ledger_entries_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_ledger_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_legal_acceptances: {
        Row: {
          acceptance_language: string
          accepted_at: string
          id: string
          privacy_policy_version: string
          seller_terms_version: string
          user_id: string
        }
        Insert: {
          acceptance_language: string
          accepted_at?: string
          id?: string
          privacy_policy_version: string
          seller_terms_version: string
          user_id: string
        }
        Update: {
          acceptance_language?: string
          accepted_at?: string
          id?: string
          privacy_policy_version?: string
          seller_terms_version?: string
          user_id?: string
        }
        Relationships: []
      }
      seller_payout_fee_allocations: {
        Row: {
          amount_millimes: number
          created_at: string
          fee_entry_id: string
          id: string
          payout_id: string
          store_id: string
        }
        Insert: {
          amount_millimes: number
          created_at?: string
          fee_entry_id: string
          id?: string
          payout_id: string
          store_id: string
        }
        Update: {
          amount_millimes?: number
          created_at?: string
          fee_entry_id?: string
          id?: string
          payout_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_payout_fee_allocations_fee_entry_id_fkey"
            columns: ["fee_entry_id"]
            isOneToOne: false
            referencedRelation: "seller_external_fee_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_payout_fee_allocations_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "seller_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_payout_fee_allocations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_payout_items: {
        Row: {
          commission_millimes: number
          created_at: string
          discount_millimes: number
          gross_millimes: number
          id: string
          ledger_entry_id: string
          order_item_id: string
          payout_id: string
          seller_amount_millimes: number
        }
        Insert: {
          commission_millimes: number
          created_at?: string
          discount_millimes?: number
          gross_millimes: number
          id?: string
          ledger_entry_id: string
          order_item_id: string
          payout_id: string
          seller_amount_millimes: number
        }
        Update: {
          commission_millimes?: number
          created_at?: string
          discount_millimes?: number
          gross_millimes?: number
          id?: string
          ledger_entry_id?: string
          order_item_id?: string
          payout_id?: string
          seller_amount_millimes?: number
        }
        Relationships: [
          {
            foreignKeyName: "seller_payout_items_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "seller_ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_payout_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_payout_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "seller_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_payout_preferences: {
        Row: {
          created_at: string
          id: string
          konnect_wallet_id: string | null
          method: Database["public"]["Enums"]["seller_payout_method"]
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          konnect_wallet_id?: string | null
          method?: Database["public"]["Enums"]["seller_payout_method"]
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          konnect_wallet_id?: string | null
          method?: Database["public"]["Enums"]["seller_payout_method"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_payout_preferences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_payouts: {
        Row: {
          commission_bps: number
          commission_millimes: number
          created_at: string
          currency: string
          discount_millimes: number
          external_fees_millimes: number
          failure_reason: string | null
          gross_millimes: number
          id: string
          idempotency_key: string
          initiated_at: string | null
          method: Database["public"]["Enums"]["seller_payout_method"]
          paid_at: string | null
          provider: string
          provider_transfer_ref: string | null
          scheduled_for: string | null
          seller_amount_millimes: number
          status: Database["public"]["Enums"]["seller_payout_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          commission_bps: number
          commission_millimes: number
          created_at?: string
          currency?: string
          discount_millimes?: number
          external_fees_millimes?: number
          failure_reason?: string | null
          gross_millimes: number
          id?: string
          idempotency_key: string
          initiated_at?: string | null
          method?: Database["public"]["Enums"]["seller_payout_method"]
          paid_at?: string | null
          provider?: string
          provider_transfer_ref?: string | null
          scheduled_for?: string | null
          seller_amount_millimes: number
          status?: Database["public"]["Enums"]["seller_payout_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          commission_bps?: number
          commission_millimes?: number
          created_at?: string
          currency?: string
          discount_millimes?: number
          external_fees_millimes?: number
          failure_reason?: string | null
          gross_millimes?: number
          id?: string
          idempotency_key?: string
          initiated_at?: string | null
          method?: Database["public"]["Enums"]["seller_payout_method"]
          paid_at?: string | null
          provider?: string
          provider_transfer_ref?: string | null
          scheduled_for?: string | null
          seller_amount_millimes?: number
          status?: Database["public"]["Enums"]["seller_payout_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_payouts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_cleanup_audit: {
        Row: {
          created_at: string
          decided_by: string | null
          decision: string
          file_version_id: string | null
          id: string
          reason: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          decided_by?: string | null
          decision: string
          file_version_id?: string | null
          id?: string
          reason: string
          storage_path: string
        }
        Update: {
          created_at?: string
          decided_by?: string | null
          decision?: string
          file_version_id?: string | null
          id?: string
          reason?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_cleanup_audit_file_version_id_fkey"
            columns: ["file_version_id"]
            isOneToOne: false
            referencedRelation: "product_file_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          avatar_path: string | null
          banner_path: string | null
          created_at: string
          id: string
          logo_path: string | null
          name: string
          owner_id: string
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          banner_path?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name: string
          owner_id: string
          slug: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          banner_path?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name?: string
          owner_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Relationships: []
      }
      terms_acceptances: {
        Row: {
          accepted_at: string
          id: string
          terms_language: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          terms_language: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          terms_language?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_file_version: {
        Args: { _version_id: string }
        Returns: undefined
      }
      admin_create_seller_payout: {
        Args: {
          _idempotency_key: string
          _scheduled_for?: string
          _store_id: string
        }
        Returns: string
      }
      admin_mark_seller_payout_failed: {
        Args: { _failure_reason: string; _payout_id: string }
        Returns: boolean
      }
      admin_mark_seller_payout_paid: {
        Args: { _payout_id: string; _transfer_reference: string }
        Returns: boolean
      }
      admin_record_seller_external_fee: {
        Args: {
          _amount_millimes: number
          _description: string
          _external_reference: string
          _fee_category: string
          _idempotency_key: string
          _order_id?: string
          _order_item_id?: string
          _source: string
          _store_id: string
        }
        Returns: string
      }
      admin_record_shared_seller_fee: {
        Args: {
          _amount_millimes: number
          _description: string
          _external_reference: string
          _fee_category: string
          _idempotency_key: string
          _order_id: string
          _source: string
        }
        Returns: number
      }
      admin_renew_entitlement: {
        Args: {
          _entitlement_id: string
          _extra_days: number
          _extra_downloads: number
          _reason: string
        }
        Returns: undefined
      }
      admin_set_commission_bps: { Args: { _bps: number }; Returns: undefined }
      archive_file_version: {
        Args: { _version_id: string }
        Returns: undefined
      }
      create_order: {
        Args: { _checkout_key: string; _product_ids: string[] }
        Returns: string
      }
      create_seller_store: {
        Args: {
          _language: string
          _name: string
          _privacy_version: string
          _slug: string
          _terms_version: string
        }
        Returns: string
      }
      finalize_download: { Args: { _reservation_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_email_verified: { Args: { _user_id: string }; Returns: boolean }
      register_file_version: {
        Args: {
          _file_name: string
          _mime_type: string
          _product_id: string
          _sha256: string
          _size_bytes: number
        }
        Returns: {
          upload_path: string
          version_id: string
        }[]
      }
      release_download: {
        Args: { _reservation_id: string }
        Returns: undefined
      }
      reserve_download: {
        Args: { _entitlement_id: string; _user_id: string }
        Returns: {
          file_name: string
          outcome: string
          reservation_id: string
          storage_path: string
        }[]
      }
      settle_order_payment: {
        Args: {
          _amount_millimes: number
          _mode: string
          _order_id: string
          _payment_ref: string
          _source: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
      order_status: "pending" | "paid" | "failed" | "cancelled"
      seller_payout_method: "weekly_manual" | "konnect_direct"
      seller_payout_status:
        | "pending"
        | "processing"
        | "paid"
        | "failed"
        | "cancelled"
      store_status: "active" | "suspended"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      order_status: ["pending", "paid", "failed", "cancelled"],
      seller_payout_method: ["weekly_manual", "konnect_direct"],
      seller_payout_status: [
        "pending",
        "processing",
        "paid",
        "failed",
        "cancelled",
      ],
      store_status: ["active", "suspended"],
    },
  },
} as const
