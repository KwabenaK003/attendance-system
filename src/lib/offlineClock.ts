import { supabase } from "./supabase";

export type OfflinePunch = {
  client_event_id: string;
  user_id: string;
  type: "in" | "out";
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  device_name: string | null;
  ip_address: string | null;
  network_name: string | null;
  verification_method: string;
  note: string;
  queued_at: string;
};

const DB_NAME = "attendance-offline";
const STORE_NAME = "punches";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Offline storage is unavailable on this device."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "client_event_id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open offline storage."));
  });
}

export async function queueOfflinePunch(punch: OfflinePunch): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(punch);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Unable to queue offline punch."));
  });
  db.close();
}

export async function getQueuedPunches(): Promise<OfflinePunch[]> {
  const db = await openDatabase();
  const punches = await new Promise<OfflinePunch[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []) as OfflinePunch[]);
    request.onerror = () => reject(request.error || new Error("Unable to read offline punches."));
  });
  db.close();
  return punches.sort((a, b) => a.queued_at.localeCompare(b.queued_at));
}

async function removeQueuedPunch(clientEventId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(clientEventId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Unable to remove synced punch."));
  });
  db.close();
}

export async function syncOfflinePunches(): Promise<{ synced: number; pending: number }> {
  if (!navigator.onLine) return { synced: 0, pending: (await getQueuedPunches()).length };
  const punches = await getQueuedPunches();
  let synced = 0;
  for (const punch of punches) {
    const { client_event_id: _clientEventId, queued_at: _queuedAt, ...payload } = punch;
    let { error } = await supabase.from("punches").insert({ ...payload, client_event_id: punch.client_event_id });
    if (error && /client_event_id/i.test(error.message || "")) {
      ({ error } = await supabase.from("punches").insert(payload));
    }
    if (error) break;
    await removeQueuedPunch(punch.client_event_id);
    synced += 1;
  }
  return { synced, pending: punches.length - synced };
}

export function createClientEventId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function installOfflineSyncListener(onSync?: (result: { synced: number; pending: number }) => void): () => void {
  const handler = () => { void syncOfflinePunches().then((result) => onSync?.(result)); };
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
