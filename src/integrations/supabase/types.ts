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
      announcements: {
        Row: {
          body: string
          created_at: string | null
          created_by: string
          id: string
          target: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          created_by: string
          id?: string
          target?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          created_by?: string
          id?: string
          target?: string | null
          title?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_at: string
          area: string | null
          created_at: string
          customer_name: string | null
          description: string | null
          duration_minutes: number
          google_calendar_user_id: string | null
          google_event_id: string | null
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
          duration_minutes?: number
          google_calendar_user_id?: string | null
          google_event_id?: string | null
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
          duration_minutes?: number
          google_calendar_user_id?: string | null
          google_event_id?: string | null
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
          appointment_at: string | null
          area: string
          building_id_hemd: string | null
          cab: string | null
          call_count: number | null
          call_notes: string | null
          call_status: string | null
          comments: string | null
          created_at: string
          customer_email: string | null
          customer_landline: string | null
          customer_mobile: string | null
          customer_name: string | null
          drive_egrafa_url: string | null
          drive_folder_url: string | null
          drive_promeleti_url: string | null
          floor: string | null
          google_sheet_row_id: number | null
          id: string
          last_called_at: string | null
          latitude: number | null
          longitude: number | null
          manager_email: string | null
          manager_mobile: string | null
          manager_name: string | null
          municipality: string | null
          organization_id: string | null
          paid_at: string | null
          payment_amount: number | null
          payment_date: string | null
          payment_notes: string | null
          pdf_url: string | null
          phone: string | null
          photos_count: number | null
          request_category: string | null
          source_tab: string | null
          sr_id: string
          status: string
          submitted_at: string | null
          technician_id: string | null
          updated_at: string
          work_type: string | null
        }
        Insert: {
          address?: string | null
          appointment_at?: string | null
          area: string
          building_id_hemd?: string | null
          cab?: string | null
          call_count?: number | null
          call_notes?: string | null
          call_status?: string | null
          comments?: string | null
          created_at?: string
          customer_email?: string | null
          customer_landline?: string | null
          customer_mobile?: string | null
          customer_name?: string | null
          drive_egrafa_url?: string | null
          drive_folder_url?: string | null
          drive_promeleti_url?: string | null
          floor?: string | null
          google_sheet_row_id?: number | null
          id?: string
          last_called_at?: string | null
          latitude?: number | null
          longitude?: number | null
          manager_email?: string | null
          manager_mobile?: string | null
          manager_name?: string | null
          municipality?: string | null
          organization_id?: string | null
          paid_at?: string | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_notes?: string | null
          pdf_url?: string | null
          phone?: string | null
          photos_count?: number | null
          request_category?: string | null
          source_tab?: string | null
          sr_id: string
          status?: string
          submitted_at?: string | null
          technician_id?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          address?: string | null
          appointment_at?: string | null
          area?: string
          building_id_hemd?: string | null
          cab?: string | null
          call_count?: number | null
          call_notes?: string | null
          call_status?: string | null
          comments?: string | null
          created_at?: string
          customer_email?: string | null
          customer_landline?: string | null
          customer_mobile?: string | null
          customer_name?: string | null
          drive_egrafa_url?: string | null
          drive_folder_url?: string | null
          drive_promeleti_url?: string | null
          floor?: string | null
          google_sheet_row_id?: number | null
          id?: string
          last_called_at?: string | null
          latitude?: number | null
          longitude?: number | null
          manager_email?: string | null
          manager_mobile?: string | null
          manager_name?: string | null
          municipality?: string | null
          organization_id?: string | null
          paid_at?: string | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_notes?: string | null
          pdf_url?: string | null
          phone?: string | null
          photos_count?: number | null
          request_category?: string | null
          source_tab?: string | null
          sr_id?: string
          status?: string
          submitted_at?: string | null
          technician_id?: string | null
          updated_at?: string
          work_type?: string | null
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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          organization_id: string | null
          page_url: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          page_url?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          page_url?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings_registry: {
        Row: {
          address: string
          area: string | null
          branch: string | null
          building_id: string | null
          cabinet: string | null
          city: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          nearby_bcp: string | null
          notes: string | null
          number: string | null
          organization_id: string | null
          postal_code: string | null
          street: string | null
          updated_at: string
        }
        Insert: {
          address: string
          area?: string | null
          branch?: string | null
          building_id?: string | null
          cabinet?: string | null
          city?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nearby_bcp?: string | null
          notes?: string | null
          number?: string | null
          organization_id?: string | null
          postal_code?: string | null
          street?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          area?: string | null
          branch?: string | null
          building_id?: string | null
          cabinet?: string | null
          city?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nearby_bcp?: string | null
          notes?: string | null
          number?: string | null
          organization_id?: string | null
          postal_code?: string | null
          street?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buildings_registry_organization_id_fkey"
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
          ball_marker_bep: number | null
          cab: string | null
          created_at: string
          floor_meters: Json | null
          floors: number | null
          google_sheet_row_id: number | null
          id: string
          material_cost: number
          ms_count: number | null
          organization_id: string | null
          otdr_positions: Json | null
          pending_note: string | null
          photo_counts: Json | null
          profit: number | null
          revenue: number
          routes: Json | null
          routing_type: string | null
          ses_id: string | null
          sr_id: string
          status: string
          updated_at: string
          vertical_infra: string | null
        }
        Insert: {
          ak?: string | null
          assignment_id?: string | null
          ball_marker_bep?: number | null
          cab?: string | null
          created_at?: string
          floor_meters?: Json | null
          floors?: number | null
          google_sheet_row_id?: number | null
          id?: string
          material_cost?: number
          ms_count?: number | null
          organization_id?: string | null
          otdr_positions?: Json | null
          pending_note?: string | null
          photo_counts?: Json | null
          profit?: number | null
          revenue?: number
          routes?: Json | null
          routing_type?: string | null
          ses_id?: string | null
          sr_id: string
          status?: string
          updated_at?: string
          vertical_infra?: string | null
        }
        Update: {
          ak?: string | null
          assignment_id?: string | null
          ball_marker_bep?: number | null
          cab?: string | null
          created_at?: string
          floor_meters?: Json | null
          floors?: number | null
          google_sheet_row_id?: number | null
          id?: string
          material_cost?: number
          ms_count?: number | null
          organization_id?: string | null
          otdr_positions?: Json | null
          pending_note?: string | null
          photo_counts?: Json | null
          profit?: number | null
          revenue?: number
          routes?: Json | null
          routing_type?: string | null
          ses_id?: string | null
          sr_id?: string
          status?: string
          updated_at?: string
          vertical_infra?: string | null
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
      daily_backups: {
        Row: {
          assignments_count: number
          assignments_snapshot: Json
          backup_date: string
          backup_type: string
          changes_summary: Json
          created_at: string
          id: string
          materials_count: number
          materials_snapshot: Json
          organization_id: string
        }
        Insert: {
          assignments_count?: number
          assignments_snapshot?: Json
          backup_date?: string
          backup_type?: string
          changes_summary?: Json
          created_at?: string
          id?: string
          materials_count?: number
          materials_snapshot?: Json
          organization_id: string
        }
        Update: {
          assignments_count?: number
          assignments_snapshot?: Json
          backup_date?: string
          backup_type?: string
          changes_summary?: Json
          created_at?: string
          id?: string
          materials_count?: number
          materials_snapshot?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_backups_organization_id_fkey"
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
      inspection_reports: {
        Row: {
          assignment_id: string
          bcp_brand: string | null
          bcp_drop_12: boolean | null
          bcp_drop_4: boolean | null
          bcp_drop_6: boolean | null
          bcp_floorbox: boolean | null
          bcp_size: string | null
          bep_brand: string | null
          bep_capacity: string | null
          bep_position: string | null
          bep_size: string | null
          bmo_brand: string | null
          bmo_capacity: string | null
          bmo_size: string | null
          building_address: string | null
          building_id: string | null
          cabinet: string | null
          cost_option: string | null
          created_at: string
          customer_apartment_code: string | null
          customer_county: string | null
          customer_email: string | null
          customer_father_name: string | null
          customer_floor: string | null
          customer_floor_select: string | null
          customer_mobile: string | null
          customer_municipality: string | null
          customer_name: string | null
          customer_notes: string | null
          customer_number: string | null
          customer_phone: string | null
          customer_postal_code: string | null
          customer_signature: string | null
          customer_street: string | null
          declarant_city: string | null
          declarant_id_number: string | null
          declarant_name: string | null
          declarant_number: string | null
          declarant_postal_code: string | null
          declarant_street: string | null
          declaration_date: string | null
          declaration_signature: string | null
          declaration_type: string | null
          engineer_signature: string | null
          entry_pipe_notes: string | null
          excavation_to_building: boolean | null
          excavation_to_pipe: boolean | null
          excavation_to_rg: boolean | null
          ext_pipe_sidewalk_excavation: boolean | null
          fence_building_mount: boolean | null
          id: string
          manager_email: string | null
          manager_mobile: string | null
          manager_name: string | null
          manager_signature: string | null
          optical_socket_position: string | null
          organization_id: string | null
          pdf_drive_url: string | null
          pdf_generated: boolean | null
          pipe_code: string | null
          pipe_placement: boolean | null
          routing_aerial: boolean | null
          routing_aerial_notes: string | null
          routing_escalit: boolean | null
          routing_external_pipe: boolean | null
          routing_other: string | null
          routing_other_notes: string | null
          service_address: string | null
          service_email: string | null
          service_phone: string | null
          sidewalk_excavation: boolean | null
          sketch_notes: string | null
          sr_id: string
          survey_id: string | null
          technician_id: string
          technician_name: string | null
          total_apartments: number | null
          total_floors: number | null
          total_shops: number | null
          total_spaces: number | null
          updated_at: string
          vertical_routing: string | null
          vertical_routing_other_notes: string | null
          wall_mount: boolean | null
        }
        Insert: {
          assignment_id: string
          bcp_brand?: string | null
          bcp_drop_12?: boolean | null
          bcp_drop_4?: boolean | null
          bcp_drop_6?: boolean | null
          bcp_floorbox?: boolean | null
          bcp_size?: string | null
          bep_brand?: string | null
          bep_capacity?: string | null
          bep_position?: string | null
          bep_size?: string | null
          bmo_brand?: string | null
          bmo_capacity?: string | null
          bmo_size?: string | null
          building_address?: string | null
          building_id?: string | null
          cabinet?: string | null
          cost_option?: string | null
          created_at?: string
          customer_apartment_code?: string | null
          customer_county?: string | null
          customer_email?: string | null
          customer_father_name?: string | null
          customer_floor?: string | null
          customer_floor_select?: string | null
          customer_mobile?: string | null
          customer_municipality?: string | null
          customer_name?: string | null
          customer_notes?: string | null
          customer_number?: string | null
          customer_phone?: string | null
          customer_postal_code?: string | null
          customer_signature?: string | null
          customer_street?: string | null
          declarant_city?: string | null
          declarant_id_number?: string | null
          declarant_name?: string | null
          declarant_number?: string | null
          declarant_postal_code?: string | null
          declarant_street?: string | null
          declaration_date?: string | null
          declaration_signature?: string | null
          declaration_type?: string | null
          engineer_signature?: string | null
          entry_pipe_notes?: string | null
          excavation_to_building?: boolean | null
          excavation_to_pipe?: boolean | null
          excavation_to_rg?: boolean | null
          ext_pipe_sidewalk_excavation?: boolean | null
          fence_building_mount?: boolean | null
          id?: string
          manager_email?: string | null
          manager_mobile?: string | null
          manager_name?: string | null
          manager_signature?: string | null
          optical_socket_position?: string | null
          organization_id?: string | null
          pdf_drive_url?: string | null
          pdf_generated?: boolean | null
          pipe_code?: string | null
          pipe_placement?: boolean | null
          routing_aerial?: boolean | null
          routing_aerial_notes?: string | null
          routing_escalit?: boolean | null
          routing_external_pipe?: boolean | null
          routing_other?: string | null
          routing_other_notes?: string | null
          service_address?: string | null
          service_email?: string | null
          service_phone?: string | null
          sidewalk_excavation?: boolean | null
          sketch_notes?: string | null
          sr_id: string
          survey_id?: string | null
          technician_id: string
          technician_name?: string | null
          total_apartments?: number | null
          total_floors?: number | null
          total_shops?: number | null
          total_spaces?: number | null
          updated_at?: string
          vertical_routing?: string | null
          vertical_routing_other_notes?: string | null
          wall_mount?: boolean | null
        }
        Update: {
          assignment_id?: string
          bcp_brand?: string | null
          bcp_drop_12?: boolean | null
          bcp_drop_4?: boolean | null
          bcp_drop_6?: boolean | null
          bcp_floorbox?: boolean | null
          bcp_size?: string | null
          bep_brand?: string | null
          bep_capacity?: string | null
          bep_position?: string | null
          bep_size?: string | null
          bmo_brand?: string | null
          bmo_capacity?: string | null
          bmo_size?: string | null
          building_address?: string | null
          building_id?: string | null
          cabinet?: string | null
          cost_option?: string | null
          created_at?: string
          customer_apartment_code?: string | null
          customer_county?: string | null
          customer_email?: string | null
          customer_father_name?: string | null
          customer_floor?: string | null
          customer_floor_select?: string | null
          customer_mobile?: string | null
          customer_municipality?: string | null
          customer_name?: string | null
          customer_notes?: string | null
          customer_number?: string | null
          customer_phone?: string | null
          customer_postal_code?: string | null
          customer_signature?: string | null
          customer_street?: string | null
          declarant_city?: string | null
          declarant_id_number?: string | null
          declarant_name?: string | null
          declarant_number?: string | null
          declarant_postal_code?: string | null
          declarant_street?: string | null
          declaration_date?: string | null
          declaration_signature?: string | null
          declaration_type?: string | null
          engineer_signature?: string | null
          entry_pipe_notes?: string | null
          excavation_to_building?: boolean | null
          excavation_to_pipe?: boolean | null
          excavation_to_rg?: boolean | null
          ext_pipe_sidewalk_excavation?: boolean | null
          fence_building_mount?: boolean | null
          id?: string
          manager_email?: string | null
          manager_mobile?: string | null
          manager_name?: string | null
          manager_signature?: string | null
          optical_socket_position?: string | null
          organization_id?: string | null
          pdf_drive_url?: string | null
          pdf_generated?: boolean | null
          pipe_code?: string | null
          pipe_placement?: boolean | null
          routing_aerial?: boolean | null
          routing_aerial_notes?: string | null
          routing_escalit?: boolean | null
          routing_external_pipe?: boolean | null
          routing_other?: string | null
          routing_other_notes?: string | null
          service_address?: string | null
          service_email?: string | null
          service_phone?: string | null
          sidewalk_excavation?: boolean | null
          sketch_notes?: string | null
          sr_id?: string
          survey_id?: string | null
          technician_id?: string
          technician_name?: string | null
          total_apartments?: number | null
          total_floors?: number | null
          total_shops?: number | null
          total_spaces?: number | null
          updated_at?: string
          vertical_routing?: string | null
          vertical_routing_other_notes?: string | null
          wall_mount?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_reports_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_reports_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
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
      org_activity: {
        Row: {
          action: string
          created_at: string | null
          id: string
          organization_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          organization_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_activity_organization_id_fkey"
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
          last_payment_date: string | null
          logo_url: string | null
          max_users: number
          monthly_price: number | null
          name: string
          next_payment_due: string | null
          notes: string | null
          payment_notes: string | null
          payment_status: string | null
          plan: string
          slug: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_payment_date?: string | null
          logo_url?: string | null
          max_users?: number
          monthly_price?: number | null
          name: string
          next_payment_due?: string | null
          notes?: string | null
          payment_notes?: string | null
          payment_status?: string | null
          plan?: string
          slug: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_payment_date?: string | null
          logo_url?: string | null
          max_users?: number
          monthly_price?: number | null
          name?: string
          next_payment_due?: string | null
          notes?: string | null
          payment_notes?: string | null
          payment_status?: string | null
          plan?: string
          slug?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pre_work_checklists: {
        Row: {
          access_confirmed: boolean
          access_confirmed_at: string | null
          assignment_id: string
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          organization_id: string | null
          photo_path: string | null
          photo_uploaded_at: string | null
          technician_id: string
          updated_at: string
        }
        Insert: {
          access_confirmed?: boolean
          access_confirmed_at?: string | null
          assignment_id: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          photo_path?: string | null
          photo_uploaded_at?: string | null
          technician_id: string
          updated_at?: string
        }
        Update: {
          access_confirmed?: boolean
          access_confirmed_at?: string | null
          assignment_id?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          photo_path?: string | null
          photo_uploaded_at?: string | null
          technician_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_work_checklists_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          area: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_online: boolean
          last_lat: number | null
          last_long: number | null
          last_seen: string | null
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
          is_online?: boolean
          last_lat?: number | null
          last_long?: number | null
          last_seen?: string | null
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
          is_online?: boolean
          last_lat?: number | null
          last_long?: number | null
          last_seen?: string | null
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
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
      sr_crew_assignments: {
        Row: {
          assignment_id: string
          category_id: string
          id: string
          measurements: Json | null
          notes: string | null
          organization_id: string
          saved_at: string | null
          saved_by: string | null
          status: string | null
          technician_id: string | null
        }
        Insert: {
          assignment_id: string
          category_id: string
          id?: string
          measurements?: Json | null
          notes?: string | null
          organization_id: string
          saved_at?: string | null
          saved_by?: string | null
          status?: string | null
          technician_id?: string | null
        }
        Update: {
          assignment_id?: string
          category_id?: string
          id?: string
          measurements?: Json | null
          notes?: string | null
          organization_id?: string
          saved_at?: string | null
          saved_by?: string | null
          status?: string | null
          technician_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sr_crew_assignments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sr_crew_assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sr_work_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sr_crew_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sr_crew_photos: {
        Row: {
          created_at: string | null
          crew_assignment_id: string
          id: string
          organization_id: string
          photo_category: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          crew_assignment_id: string
          id?: string
          organization_id: string
          photo_category: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          crew_assignment_id?: string
          id?: string
          organization_id?: string
          photo_category?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sr_crew_photos_crew_assignment_id_fkey"
            columns: ["crew_assignment_id"]
            isOneToOne: false
            referencedRelation: "sr_crew_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sr_crew_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sr_work_categories: {
        Row: {
          active: boolean | null
          can_close_sr: boolean | null
          id: string
          material_codes: string[] | null
          name: string
          organization_id: string
          photo_categories: string[] | null
          requires_measurements: boolean | null
          requires_works: boolean | null
          sort_order: number
          work_prefixes: string[] | null
        }
        Insert: {
          active?: boolean | null
          can_close_sr?: boolean | null
          id?: string
          material_codes?: string[] | null
          name: string
          organization_id: string
          photo_categories?: string[] | null
          requires_measurements?: boolean | null
          requires_works?: boolean | null
          sort_order?: number
          work_prefixes?: string[] | null
        }
        Update: {
          active?: boolean | null
          can_close_sr?: boolean | null
          id?: string
          material_codes?: string[] | null
          name?: string
          organization_id?: string
          photo_categories?: string[] | null
          requires_measurements?: boolean | null
          requires_works?: boolean | null
          sort_order?: number
          work_prefixes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "sr_work_categories_organization_id_fkey"
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
      technician_inventory: {
        Row: {
          id: string
          material_id: string
          organization_id: string
          quantity: number
          technician_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          material_id: string
          organization_id: string
          quantity?: number
          technician_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          material_id?: string
          organization_id?: string
          quantity?: number
          technician_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_inventory_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_inventory_history: {
        Row: {
          change_amount: number
          changed_by: string | null
          construction_sr_id: string | null
          created_at: string
          id: string
          material_id: string
          organization_id: string
          reason: string
          technician_id: string
        }
        Insert: {
          change_amount: number
          changed_by?: string | null
          construction_sr_id?: string | null
          created_at?: string
          id?: string
          material_id: string
          organization_id: string
          reason?: string
          technician_id: string
        }
        Update: {
          change_amount?: number
          changed_by?: string | null
          construction_sr_id?: string | null
          created_at?: string
          id?: string
          material_id?: string
          organization_id?: string
          reason?: string
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_inventory_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_inventory_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_locations: {
        Row: {
          accuracy: number | null
          id: string
          latitude: number
          longitude: number
          organization_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          id?: string
          latitude: number
          longitude: number
          organization_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          id?: string
          latitude?: number
          longitude?: number
          organization_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_google_calendar_tokens: {
        Row: {
          access_token: string | null
          calendar_id: string | null
          connected_at: string
          google_email: string | null
          id: string
          refresh_token: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string | null
          connected_at?: string
          google_email?: string | null
          id?: string
          refresh_token: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string | null
          connected_at?: string
          google_email?: string | null
          id?: string
          refresh_token?: string
          token_expires_at?: string | null
          updated_at?: string
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
      work_time_entries: {
        Row: {
          assignment_id: string
          check_in: string
          check_out: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          notes: string | null
          organization_id: string | null
          technician_id: string
        }
        Insert: {
          assignment_id: string
          check_in?: string
          check_out?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          technician_id: string
        }
        Update: {
          assignment_id?: string
          check_in?: string
          check_out?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_time_entries_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
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
      search_buildings: {
        Args: { org_id?: string; search_term: string }
        Returns: {
          address: string
          area: string | null
          branch: string | null
          building_id: string | null
          cabinet: string | null
          city: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          nearby_bcp: string | null
          notes: string | null
          number: string | null
          organization_id: string | null
          postal_code: string | null
          street: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "buildings_registry"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
