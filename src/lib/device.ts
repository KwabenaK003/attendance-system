import { supabase } from "./supabase";

const DEVICE_KEY = "attendance.device.id";

export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export async function registerDevice(name = "Attendance Tablet") {
  const deviceId = getDeviceId();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("registered_devices").upsert({
    device_id: deviceId,
    name,
    device_type: /Android|iPad|Tablet/i.test(navigator.userAgent) ? "tablet" : "browser",
    user_agent: navigator.userAgent,
    registered_by: user?.id ?? null,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "device_id" }).select().single();
  if (error) throw error;
  if (data?.status === "revoked") throw new Error("This attendance device has been revoked by an administrator.");
  return data;
}
