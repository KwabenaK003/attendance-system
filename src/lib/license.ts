import { supabase } from "./supabase";

const LICENSE_CACHE_KEY = "attendance.license.cache";

export type LicenseStatus = { active: boolean; message: string; expiresAt: string | null; plan: string | null };

export async function validateLicense(): Promise<LicenseStatus> {
  try {
    const { data, error } = await supabase.rpc("validate_current_license");
    if (!error && data) {
      const result = data as LicenseStatus;
      localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify(result));
      return result;
    }
  } catch { /* fall through to cached state */ }
  const cached = localStorage.getItem(LICENSE_CACHE_KEY);
  if (cached) {
    const result = JSON.parse(cached) as LicenseStatus;
    if (result.active && (!result.expiresAt || new Date(result.expiresAt) > new Date())) return result;
  }
  return { active: false, message: "An active software license is required.", expiresAt: null, plan: null };
}

export async function activateLicense(licenseKey: string): Promise<LicenseStatus> {
  const { data, error } = await supabase.rpc("activate_license", { license_key_input: licenseKey.trim() });
  if (error) throw error;
  const result = data as LicenseStatus;
  localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify(result));
  return result;
}
