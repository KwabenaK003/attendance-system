export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Nullable<T> = T | null;

type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Array<{
    foreignKeyName: string;
    columns: string[];
    isOneToOne: boolean;
    referencedRelation: string;
    referencedColumns: string[];
  }>;
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<
        {
          id: string;
          full_name: Nullable<string>;
          role: string;
          department: Nullable<string>;
          company_name: Nullable<string>;
          face_reference: Nullable<Json>;
          hourly_rate: Nullable<number>;
          created_at: string;
        },
        {
          id: string;
          full_name?: Nullable<string>;
          role?: string;
          department?: Nullable<string>;
          company_name?: Nullable<string>;
          face_reference?: Nullable<Json>;
          hourly_rate?: Nullable<number>;
          created_at?: string;
        }
      >;
      punches: TableDefinition<
        {
          id: string;
          user_id: Nullable<string>;
          type: Nullable<"in" | "out" | string>;
          timestamp: string;
          latitude: Nullable<number>;
          longitude: Nullable<number>;
          location_name: Nullable<string>;
          device_name: Nullable<string>;
          ip_address: Nullable<string>;
          network_name: Nullable<string>;
          verification_method: Nullable<string>;
          note: Nullable<string>;
          created_at: string;
        },
        {
          id?: string;
          user_id?: Nullable<string>;
          type?: Nullable<"in" | "out" | string>;
          timestamp?: string;
          latitude?: Nullable<number>;
          longitude?: Nullable<number>;
          location_name?: Nullable<string>;
          device_name?: Nullable<string>;
          ip_address?: Nullable<string>;
          network_name?: Nullable<string>;
          verification_method?: Nullable<string>;
          note?: Nullable<string>;
          created_at?: string;
        }
      >;
      leave_requests: TableDefinition<
        {
          id: string;
          user_id: string;
          type: "sick" | "vacation" | "personal" | "maternal" | "study" | "other" | string;
          start_date: string;
          end_date: string;
          hours: Nullable<number>;
          reason: Nullable<string>;
          status: "pending" | "approved" | "rejected" | string;
          approved_by: Nullable<string>;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          type: "sick" | "vacation" | "personal" | "maternal" | "study" | "other" | string;
          start_date: string;
          end_date: string;
          hours?: Nullable<number>;
          reason?: Nullable<string>;
          status?: "pending" | "approved" | "rejected" | string;
          approved_by?: Nullable<string>;
          created_at?: string;
        }
      >;
      members: TableDefinition<
        {
          id: string;
          full_name: string;
          company_name: Nullable<string>;
          role: Nullable<string>;
          email: Nullable<string>;
          department: Nullable<string>;
          hourly_rate: Nullable<number>;
          phone: Nullable<string>;
          address: Nullable<string>;
          date_of_birth: Nullable<string>;
          gender: Nullable<"male" | "female" | "other" | string>;
          employment_type: Nullable<string>;
          start_date: Nullable<string>;
          employee_id: Nullable<string>;
          emergency_contact_name: Nullable<string>;
          emergency_contact_phone: Nullable<string>;
          notes: Nullable<string>;
          face_reference: Nullable<Json>;
          face_enrolled: Nullable<boolean>;
          status: Nullable<"active" | "inactive" | string>;
          created_by: Nullable<string>;
          created_at: string;
        },
        {
          id?: string;
          full_name: string;
          company_name?: Nullable<string>;
          role?: Nullable<string>;
          email?: Nullable<string>;
          department?: Nullable<string>;
          hourly_rate?: Nullable<number>;
          phone?: Nullable<string>;
          address?: Nullable<string>;
          date_of_birth?: Nullable<string>;
          gender?: Nullable<"male" | "female" | "other" | string>;
          employment_type?: Nullable<string>;
          start_date?: Nullable<string>;
          employee_id?: Nullable<string>;
          emergency_contact_name?: Nullable<string>;
          emergency_contact_phone?: Nullable<string>;
          notes?: Nullable<string>;
          face_reference?: Nullable<Json>;
          face_enrolled?: Nullable<boolean>;
          status?: Nullable<"active" | "inactive" | string>;
          created_by?: Nullable<string>;
          created_at?: string;
        }
      >;
      member_entries: TableDefinition<
        {
          id: string;
          member_id: string;
          punch_in: string;
          punch_out: Nullable<string>;
          hours: Nullable<number>;
          latitude: Nullable<number>;
          longitude: Nullable<number>;
          location_name: Nullable<string>;
          device_name: Nullable<string>;
          ip_address: Nullable<string>;
          network_name: Nullable<string>;
          verification_method: Nullable<string>;
          note: Nullable<string>;
          created_by: Nullable<string>;
          created_at: string;
        },
        {
          id?: string;
          member_id: string;
          punch_in?: string;
          punch_out?: Nullable<string>;
          hours?: Nullable<number>;
          latitude?: Nullable<number>;
          longitude?: Nullable<number>;
          location_name?: Nullable<string>;
          device_name?: Nullable<string>;
          ip_address?: Nullable<string>;
          network_name?: Nullable<string>;
          verification_method?: Nullable<string>;
          note?: Nullable<string>;
          created_by?: Nullable<string>;
          created_at?: string;
        }
      >;
      visitors: TableDefinition<
        {
          id: string;
          full_name: string;
          company_name: Nullable<string>;
          purpose_of_visit: string;
          host_member_id: Nullable<string>;
          phone: Nullable<string>;
          email: Nullable<string>;
          notes: Nullable<string>;
          visit_date: string;
          created_by: Nullable<string>;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          full_name: string;
          company_name?: Nullable<string>;
          purpose_of_visit: string;
          host_member_id?: Nullable<string>;
          phone?: Nullable<string>;
          email?: Nullable<string>;
          notes?: Nullable<string>;
          visit_date?: string;
          created_by?: Nullable<string>;
          created_at?: string;
          updated_at?: string;
        }
      >;
      system_settings: TableDefinition<
        {
          id: string;
          settings: Json;
          updated_at: string;
        },
        {
          id: string;
          settings?: Json;
          updated_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin_or_manager: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
