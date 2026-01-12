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
      scraped_futures: {
        Row: {
          change: string | null
          contract: string
          created_at: string
          expires_at: string
          high: string | null
          id: string
          last: string | null
          low: string | null
          month: string | null
          open: string | null
          open_interest: string | null
          percent_change: string | null
          source: string | null
          symbol: string
          time: string | null
          volume: string | null
        }
        Insert: {
          change?: string | null
          contract: string
          created_at?: string
          expires_at: string
          high?: string | null
          id?: string
          last?: string | null
          low?: string | null
          month?: string | null
          open?: string | null
          open_interest?: string | null
          percent_change?: string | null
          source?: string | null
          symbol: string
          time?: string | null
          volume?: string | null
        }
        Update: {
          change?: string | null
          contract?: string
          created_at?: string
          expires_at?: string
          high?: string | null
          id?: string
          last?: string | null
          low?: string | null
          month?: string | null
          open?: string | null
          open_interest?: string | null
          percent_change?: string | null
          source?: string | null
          symbol?: string
          time?: string | null
          volume?: string | null
        }
        Relationships: []
      }
      scraped_maturities: {
        Row: {
          code: string
          created_at: string
          expiration: string | null
          expires_at: string
          id: string
          label: string
          source: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          expiration?: string | null
          expires_at: string
          id?: string
          label: string
          source?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          expiration?: string | null
          expires_at?: string
          id?: string
          label?: string
          source?: string | null
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      scraped_options: {
        Row: {
          ask: string | null
          bid: string | null
          change: string | null
          created_at: string
          delta: string | null
          expires_at: string
          gamma: string | null
          id: string
          iv: string | null
          last: string | null
          maturity: string
          open_interest: string | null
          option_type: string
          source: string | null
          strike: string
          symbol: string
          theta: string | null
          vega: string | null
          volume: string | null
        }
        Insert: {
          ask?: string | null
          bid?: string | null
          change?: string | null
          created_at?: string
          delta?: string | null
          expires_at: string
          gamma?: string | null
          id?: string
          iv?: string | null
          last?: string | null
          maturity: string
          open_interest?: string | null
          option_type: string
          source?: string | null
          strike: string
          symbol: string
          theta?: string | null
          vega?: string | null
          volume?: string | null
        }
        Update: {
          ask?: string | null
          bid?: string | null
          change?: string | null
          created_at?: string
          delta?: string | null
          expires_at?: string
          gamma?: string | null
          id?: string
          iv?: string | null
          last?: string | null
          maturity?: string
          open_interest?: string | null
          option_type?: string
          source?: string | null
          strike?: string
          symbol?: string
          theta?: string | null
          vega?: string | null
          volume?: string | null
        }
        Relationships: []
      }
      scraped_strikes: {
        Row: {
          created_at: string
          exchange: string
          expires_at: string
          id: string
          strike: number
          symbol: string
        }
        Insert: {
          created_at?: string
          exchange: string
          expires_at: string
          id?: string
          strike: number
          symbol: string
        }
        Update: {
          created_at?: string
          exchange?: string
          expires_at?: string
          id?: string
          strike?: number
          symbol?: string
        }
        Relationships: []
      }
      scraped_symbols: {
        Row: {
          category: string
          change: string | null
          created_at: string
          expires_at: string
          id: string
          latest: string | null
          name: string
          source: string | null
          symbol: string
          updated_at: string
          volume: string | null
        }
        Insert: {
          category: string
          change?: string | null
          created_at?: string
          expires_at: string
          id?: string
          latest?: string | null
          name: string
          source?: string | null
          symbol: string
          updated_at?: string
          volume?: string | null
        }
        Update: {
          category?: string
          change?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          latest?: string | null
          name?: string
          source?: string | null
          symbol?: string
          updated_at?: string
          volume?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_scraped_data: { Args: never; Returns: undefined }
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
