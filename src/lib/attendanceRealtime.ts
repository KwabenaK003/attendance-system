import { supabase } from "./supabase";

type AttendanceRealtimeOptions = {
  channelName: string;
  profileId?: string | null;
  isManagement: boolean;
  onChange: (...args: unknown[]) => void;
};

export function createAttendanceRealtimeChannel({ channelName, profileId, isManagement, onChange }: AttendanceRealtimeOptions) {
  const channel = supabase.channel(channelName);

  if (isManagement) {
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "punches" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "member_entries" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, onChange);
  } else if (profileId) {
    channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "punches",
      filter: `user_id=eq.${profileId}`,
    }, onChange);
  }

  channel.subscribe();
  return channel;
}
