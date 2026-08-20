import { supabase } from "./supabase";
import { emitAppNotification } from "./systemSettings";

export async function writeAuditLog(action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  emitAppNotification(
    action.split("_").join(" ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    `${entityType} activity was recorded just now.`,
  );
  const { error } = await supabase.from("audit_logs").insert({
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
  if (error) console.warn("Audit log unavailable:", error.message);
}
