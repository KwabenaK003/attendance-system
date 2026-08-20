import { supabase } from "./supabase";

export const KIOSK_TOKEN = import.meta.env.VITE_KIOSK_TOKEN?.trim() || "";

export type KioskPerson = {
  id: string;
  kind: "staff" | "member";
  full_name: string | null;
  role: string | null;
  department: string | null;
  face_reference: unknown | null;
};

export function kioskIsConfigured() {
  return Boolean(KIOSK_TOKEN);
}

export function kioskUrl(path: string) {
  const configuredBase = import.meta.env.VITE_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  const base = new URL(path, configuredBase || window.location.origin);
  base.searchParams.set("token", KIOSK_TOKEN);
  return base.toString();
}

export async function kioskGetPeople() {
  return supabase.rpc("kiosk_get_people", { kiosk_token: KIOSK_TOKEN });
}

export async function kioskGetSchedule(kind: "staff" | "member", id: string) {
  return supabase.rpc("kiosk_get_schedule", { kiosk_token: KIOSK_TOKEN, subject_kind: kind, subject_id: id });
}

export async function kioskGetStatus(kind: "staff" | "member", id: string) {
  return supabase.rpc("kiosk_get_status", { kiosk_token: KIOSK_TOKEN, subject_kind: kind, subject_id: id });
}

export async function kioskPunchStaff(payload: Record<string, unknown>) {
  return supabase.rpc("kiosk_punch_staff", { kiosk_token: KIOSK_TOKEN, ...payload });
}

export async function kioskPunchMember(payload: Record<string, unknown>) {
  return supabase.rpc("kiosk_punch_member", { kiosk_token: KIOSK_TOKEN, ...payload });
}
