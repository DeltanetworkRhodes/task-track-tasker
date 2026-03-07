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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          sr_id?: string
          survey_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_history: {
        Row: {
          assignment_id: string
          changed_by: string | null
          created_at: string
          id: string
          new_status: string
          note: string | null
          old_status: string | null
          organization_id: string | null
        }
        Insert: {
          assignment_id: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: string
          note?: string | null
          old_status?: string | null
          organization_id?: string | null
        }
        Update: {
          assignment_id?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: string
          note?: string | null
          old_status?: string | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_history_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          drive_egrafa_url: string | null
          drive_folder_url: string | null
          drive_promeleti_url: string | null
          google_sheet_row_id: number | null
          id: string
          organization_id: string | null
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
          drive_egrafa_url?: string | null
          drive_folder_url?: string | null
          drive_promeleti_url?: string | null
          google_sheet_row_id?: number | null
          id?: string
          organization_id?: string | null
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
          drive_egrafa_url?: string | null
          drive_folder_url?: string | null
          drive_promeleti_url?: string | null
          google_sheet_row_id?: number | null
          id?: string
          organization_id?: string | null
          pdf_url?: string | null
          phone?: string | null
          photos_count?: number | null
          source_tab?: string | null
          sr_id?: string
          status?: string
          technician_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_materials: {
        Row: {
          construction_id: string
          created_at: string
          id: string
          material_id: string
          organization_id: string | null
          quantity: number
          source: string
        }
        Insert: {
          construction_id: string
          created_at?: string
          id?: string
          material_id: string
          organization_id?: string | null
          quantity?: number
          source?: string
        }
        Update: {
          construction_id?: string
          created_at?: string
          id?: string
          material_id?: string
          organization_id?: string | null
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
          {
            foreignKeyName: "construction_materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_works: {
        Row: {
          construction_id: string
          created_at: string
          id: string
          organization_id: string | null
          quantity: number
          subtotal: number
          unit_price: number
          work_pricing_id: string
        }
        Insert: {
          construction_id: string
          created_at?: string
          id?: string
          organization_id?: string | null
          quantity?: number
          subtotal?: number
          unit_price?: number
          work_pricing_id: string
        }
        Update: {
          construction_id?: string
          created_at?: string
          id?: string
          organization_id?: string | null
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
            foreignKeyName: "construction_works_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          pending_note: string | null
          profit: number | null
          revenue: number
          routes: Json | null
          routing_type: string | null
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
          organization_id?: string | null
          pending_note?: string | null
          profit?: number | null
          revenue?: number
          routes?: Json | null
          routing_type?: string | null
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
          organization_id?: string | null
          pending_note?: string | null
          profit?: number | null
          revenue?: number
          routes?: Json | null
          routing_type?: string | null
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
          {
            foreignKeyName: "constructions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          id: string
          organization_id: string | null
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gis_data: {
        Row: {
          admin_signature: boolean | null
          area_type: string | null
          assignment_id: string
          associated_bcp: string | null
          bep_floor: string | null
          bep_only: boolean | null
          bep_template: string | null
          bep_type: string | null
          bmo_type: string | null
          building_id: string | null
          conduit: string | null
          created_at: string
          customer_floor: string | null
          deh_nanotronix: boolean | null
          distance_from_cabinet: number | null
          failure: string | null
          file_path: string | null
          floor_details: Json | null
          floors: number | null
          gis_works: Json | null
          id: string
          latitude: number | null
          longitude: number | null
          nanotronix: boolean | null
          nearby_bcp: string | null
          new_bcp: string | null
          notes: string | null
          optical_paths: Json | null
          organization_id: string | null
          raw_data: Json | null
          smart_readiness: boolean | null
          sr_id: string
          updated_at: string
          warning: string | null
        }
        Insert: {
          admin_signature?: boolean | null
          area_type?: string | null
          assignment_id: string
          associated_bcp?: string | null
          bep_floor?: string | null
          bep_only?: boolean | null
          bep_template?: string | null
          bep_type?: string | null
          bmo_type?: string | null
          building_id?: string | null
          conduit?: string | null
          created_at?: string
          customer_floor?: string | null
          deh_nanotronix?: boolean | null
          distance_from_cabinet?: number | null
          failure?: string | null
          file_path?: string | null
          floor_details?: Json | null
          floors?: number | null
          gis_works?: Json | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nanotronix?: boolean | null
          nearby_bcp?: string | null
          new_bcp?: string | null
          notes?: string | null
          optical_paths?: Json | null
          organization_id?: string | null
          raw_data?: Json | null
          smart_readiness?: boolean | null
          sr_id: string
          updated_at?: string
          warning?: string | null
        }
        Update: {
          admin_signature?: boolean | null
          area_type?: string | null
          assignment_id?: string
          associated_bcp?: string | null
          bep_floor?: string | null
          bep_only?: boolean | null
          bep_template?: string | null
          bep_type?: string | null
          bmo_type?: string | null
          building_id?: string | null
          conduit?: string | null
          created_at?: string
          customer_floor?: string | null
          deh_nanotronix?: boolean | null
          distance_from_cabinet?: number | null
          failure?: string | null
          file_path?: string | null
          floor_details?: Json | null
          floors?: number | null
          gis_works?: Json | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nanotronix?: boolean | null
          nearby_bcp?: string | null
          new_bcp?: string | null
          notes?: string | null
          optical_paths?: Json | null
          organization_id?: string | null
          raw_data?: Json | null
          smart_readiness?: boolean | null
          sr_id?: string
          updated_at?: string
          warning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gis_data_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gis_data_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      material_stock_history: {
        Row: {
          change_amount: number
          changed_by: string | null
          created_at: string
          id: string
          material_id: string
          new_stock: number
          old_stock: number
          organization_id: string | null
          reason: string | null
        }
        Insert: {
          change_amount?: number
          changed_by?: string | null
          created_at?: string
          id?: string
          material_id: string
          new_stock?: number
          old_stock?: number
          organization_id?: string | null
          reason?: string | null
        }
        Update: {
          change_amount?: number
          changed_by?: string | null
          created_at?: string
          id?: string
          material_id?: string
          new_stock?: number
          old_stock?: number
          organization_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_stock_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_stock_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          code: string
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          price?: number
          source?: string
          stock?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          organization_id: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          organization_id?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          organization_id?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          id: string
          organization_id: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          max_users: number
          name: string
          plan: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          max_users?: number
          name: string
          plan?: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          max_users?: number
          name?: string
          plan?: string
          slug?: string
          status?: string
          updated_at?: string
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_per_sr: {
        Row: {
          created_at: string
          expenses: number
          id: string
          organization_id: string | null
          profit: number
          revenue: number
          sr_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expenses?: number
          id?: string
          organization_id?: string | null
          profit?: number
          revenue?: number
          sr_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expenses?: number
          id?: string
          organization_id?: string | null
          profit?: number
          revenue?: number
          sr_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_per_sr_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sr_comments: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          message: string
          organization_id: string | null
          user_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          message: string
          organization_id?: string | null
          user_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          message?: string
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sr_comments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sr_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_files: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_type: string
          id: string
          organization_id: string | null
          survey_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_type: string
          id?: string
          organization_id?: string | null
          survey_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          organization_id?: string | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          sr_id?: string
          status?: string
          technician_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surveys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_pricing_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "technician" | "super_admin"
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
      app_role: ["admin", "technician", "super_admin"],
    },
  },
} as const
