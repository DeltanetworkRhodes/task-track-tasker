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
      appointments: {
        Row: {
          appointment_at: string
          area: string | null
          created_at: string
          customer_name: string | null
          description: string | null
          id: string
          sr_id: string
          survey_id: string | null
        }
        Insert: {
          appointment_at: string
          area?: string | null
          created_at?: string
          customer_name?: string | null
          description?: string | null
          id?: string
          sr_id: string
          survey_id?: string | null
        }
        Update: {
          appointment_at?: string
          area?: string | null
          created_at?: string
          customer_name?: string | null
          description?: string | null
          id?: string
          sr_id?: string
          survey_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          address: string | null
          area: string
          cab: string | null
          comments: string | null
          created_at: string
          customer_name: string | null
          drive_folder_url: string | null
          google_sheet_row_id: number | null
          id: string
          pdf_url: string | null
          phone: string | null
          photos_count: number | null
          source_tab: string | null
          sr_id: string
          status: string
          technician_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          area: string
          cab?: string | null
          comments?: string | null
          created_at?: string
          customer_name?: string | null
          drive_folder_url?: string | null
          google_sheet_row_id?: number | null
          id?: string
          pdf_url?: string | null
          phone?: string | null
          photos_count?: number | null
          source_tab?: string | null
          sr_id: string
          status?: string
          technician_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          area?: string
          cab?: string | null
          comments?: string | null
          created_at?: string
          customer_name?: string | null
          drive_folder_url?: string | null
          google_sheet_row_id?: number | null
          id?: string
          pdf_url?: string | null
          phone?: string | null
          photos_count?: number | null
          source_tab?: string | null
          sr_id?: string
          status?: string
          technician_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      construction_materials: {
        Row: {
          construction_id: string
          created_at: string
          id: string
          material_id: string
          quantity: number
          source: string
        }
        Insert: {
          construction_id: string
          created_at?: string
          id?: string
          material_id: string
          quantity?: number
          source?: string
        }
        Update: {
          construction_id?: string
          created_at?: string
          id?: string
          material_id?: string
          quantity?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_materials_construction_id_fkey"
            columns: ["construction_id"]
            isOneToOne: false
            referencedRelation: "constructions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_works: {
        Row: {
          construction_id: string
          created_at: string
          id: string
          quantity: number
          subtotal: number
          unit_price: number
          work_pricing_id: string
        }
        Insert: {
          construction_id: string
          created_at?: string
          id?: string
          quantity?: number
          subtotal?: number
          unit_price?: number
          work_pricing_id: string
        }
        Update: {
          construction_id?: string
          created_at?: string
          id?: string
          quantity?: number
          subtotal?: number
          unit_price?: number
          work_pricing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_works_construction_id_fkey"
            columns: ["construction_id"]
            isOneToOne: false
            referencedRelation: "constructions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_works_work_pricing_id_fkey"
            columns: ["work_pricing_id"]
            isOneToOne: false
            referencedRelation: "work_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      constructions: {
        Row: {
          ak: string | null
          assignment_id: string | null
          cab: string | null
          created_at: string
          floors: number | null
          google_sheet_row_id: number | null
          id: string
          material_cost: number
          profit: number | null
          revenue: number
          ses_id: string | null
          sr_id: string
          status: string
          updated_at: string
        }
        Insert: {
          ak?: string | null
          assignment_id?: string | null
          cab?: string | null
          created_at?: string
          floors?: number | null
          google_sheet_row_id?: number | null
          id?: string
          material_cost?: number
          profit?: number | null
          revenue?: number
          ses_id?: string | null
          sr_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          ak?: string | null
          assignment_id?: string | null
          cab?: string | null
          created_at?: string
          floors?: number | null
          google_sheet_row_id?: number | null
          id?: string
          material_cost?: number
          profit?: number | null
          revenue?: number
          ses_id?: string | null
          sr_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "constructions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          code: string
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          price: number
          source: string
          stock: number
          unit: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name: string
          price?: number
          source: string
          stock?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name?: string
          price?: number
          source?: string
          stock?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          area: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profit_per_sr: {
        Row: {
          created_at: string
          expenses: number
          id: string
          profit: number
          revenue: number
          sr_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expenses?: number
          id?: string
          profit?: number
          revenue?: number
          sr_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expenses?: number
          id?: string
          profit?: number
          revenue?: number
          sr_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      survey_files: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_type: string
          id: string
          survey_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_type: string
          id?: string
          survey_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_files_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          area: string
          comments: string | null
          created_at: string
          email_sent: boolean | null
          id: string
          sr_id: string
          status: string
          technician_id: string
          updated_at: string
        }
        Insert: {
          area: string
          comments?: string | null
          created_at?: string
          email_sent?: boolean | null
          id?: string
          sr_id: string
          status?: string
          technician_id: string
          updated_at?: string
        }
        Update: {
          area?: string
          comments?: string | null
          created_at?: string
          email_sent?: boolean | null
          id?: string
          sr_id?: string
          status?: string
          technician_id?: string
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
      work_pricing: {
        Row: {
          category: string | null
          code: string
          created_at: string
          description: string
          id: string
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          description: string
          id?: string
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          description?: string
          id?: string
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "technician"
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
    Enums: {
      app_role: ["admin", "technician"],
    },
  },
} as const
