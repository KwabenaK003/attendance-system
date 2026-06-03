// ─── Common shared types ─────────────────────────────────────────────────────

export type UserRole =
  | "admin"
  | "manager"
  | "supervisor"
  | "employee"
  | "intern"
  | "contractor";

export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type PunchType = "in" | "out";
export type PersonKind = "staff" | "member";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type LeaveType = "sick" | "vacation" | "personal" | "other";
export type ProjectStatus = "active" | "completed" | "on_hold";

// ─── Face types ──────────────────────────────────────────────────────────────

export interface FaceReference {
  descriptor?: number[];
  timestamp?: string;
  image?: string;
  hash?: string;
  hasFace?: boolean;
  version?: number;
  createdAt?: string;
}

export interface FaceEnrollment {
  reference: FaceReference;
  photo: string;
  cleared?: boolean;
}

export interface FaceComparisonResult {
  matched: boolean;
  similarity: number;
  distance: number;
}

export interface SelectOption {
  id: string;
  full_name: string;
  department?: string | null;
  hourly_rate?: number | null;
}

// ─── Database row types ───────────────────────────────────────────────────────

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole | string;
  department: string | null;
  company_name?: string | null;
  hourly_rate: number | null;
  face_reference: FaceReference | null;
  created_at: string;
  email?: string | null;
}

export interface Punch {
  id: string;
  user_id: string;
  type: PunchType;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  note: string | null;
  created_at: string;
}

export interface Member {
  id: string;
  full_name: string;
  role: UserRole;
  company_name: string | null;
  email: string | null;
  department: string | null;
  hourly_rate: number | null;
  phone: string | null;
  address: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;
  employment_type: EmploymentType | null;
  start_date: string | null;
  employee_id: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  face_reference: FaceReference | null;
  face_enrolled: boolean | null;
  status: "active" | "inactive" | null;
  created_by: string | null;
  created_at: string;
}

export interface MemberEntry {
  id: string;
  member_id: string;
  punch_in: string;
  punch_out: string | null;
  hours: number | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  members?: Partial<Member> | Partial<Member>[] | null;
}

export interface LeaveRequest {
  id: string;
  user_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  hours: number | null;
  reason: string | null;
  status: LeaveStatus;
  approved_by: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  client: string | null;
  hourly_rate: number | null;
  budget_hours: number | null;
  status: ProjectStatus;
  created_by: string | null;
  created_at: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

// ─── Kiosk / Clock types ─────────────────────────────────────────────────────

export interface KioskPerson {
  id: string;
  kind: PersonKind;
  full_name: string;
  role: string;
  department?: string | null;
  face_reference?: FaceReference | null;
}

export interface ClockMetadata {
  deviceName: string;
  networkName: string;
  ipAddress: string | null;
  locationName: string | null;
}

export interface PunchResult {
  success: boolean;
  name: string;
  type: PunchType;
  confidence: number | null;
  locationName: string | null;
  deviceName: string;
  network: string;
  ip: string | null;
  timestamp: string;
}

export interface Visitor {
  id: string;
  full_name: string;
  company_name: string | null;
  purpose_of_visit: string;
  host_member_id: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  visit_date: string;
  created_by: string | null;
  created_at: string;
  updated_at?: string | null;
  host_member?: { full_name?: string | null } | { full_name?: string | null }[] | null;
}

export interface AdminUser {
  id: string;
  full_name: string;
  email?: string;
  role: string;
  created_at?: string;
  updated_at?: string;
}

export interface StatusMessage {
  type: "success" | "error" | "warning" | "info";
  text: string;
}

export interface ToastMessage {
  type: "success" | "error";
  message: string;
}

export interface ChartDatum {
  name?: string;
  label?: string;
  day?: string;
  month?: string;
  value?: number;
  hours?: number;
  fill?: string;
}
