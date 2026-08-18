import { supabase } from "./supabase";

export async function writeAuditLog(action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from("audit_logs").insert({
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
  if (error) console.warn("Audit log unavailable:", error.message);
}
