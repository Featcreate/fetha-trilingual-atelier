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
          finalized_at: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          entitlement_id: string
          finalized_at?: string | null
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          entitlement_id?: string
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
          status: Database["public"]["Enums"]["order_status"]
          total_millimes: number
          updated_at: string
          user_id: string
        }
        Insert: {
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
          status?: Database["public"]["Enums"]["order_status"]
          total_millimes: number
          updated_at?: string
          user_id: string
        }
        Update: {
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
      platform_settings: {
        Row: {
          commission_bps: number
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commission_bps?: number
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commission_bps?: number
          id?: boolean
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
      products: {
        Row: {
          created_at: string
          description: string
          id: string
          image_path: string | null
          is_active: boolean
          name: string
          price_millimes: number
          product_type: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          price_millimes: number
          product_type?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          name?: string
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
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
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
      finalize_download: { Args: { _reservation_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
      store_status: ["active", "suspended"],
    },
  },
} as const
