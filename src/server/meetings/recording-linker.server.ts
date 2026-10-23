/** Links Zoho cloud recordings to an LMS class. Stores only the Zoho id; the play link is fetched on open. */
import { getRecordingsForMeeting } from "./zoho-meeting.server";

type Db = { from: (t: string) => any };

export async function linkClassRecordings(db: Db, cls: { id: string; title: string; zoho_meeting_key: string; class_date?: string; start_time?: string; end_time?: string }, actorId: string | null): Promise<{ found: number; linked: number; generating: number }> {
  let recs = await getRecordingsForMeeting(cls.zoho_meeting_key);
  // Zoho reuses a meeting key across sessions, so only take recordings started on this class's day/window.
  if (cls.class_date && cls.start_time && cls.end_time) {
    const { classWindowMs } = await import("@/features/attendance/services/attendance-matching");
    const { start, end } = classWindowMs(cls.class_date, cls.start_time, cls.end_time);
    recs = recs.filter((r) => r.startMs === null || (r.startMs >= start - 3600_000 && r.startMs <= end + 3 * 3600_000));
  }
  const ready = recs.filter((r) => !r.generating);
  let linked = 0;
  for (const [i, r] of ready.entries()) {
    const { data: exists } = await db.from("recordings").select("id").eq("zoho_recording_id", r.id).maybeSingle();
    if (exists) continue;
    const { data, error } = await db.from("recordings").insert({
      class_id: cls.id, title: ready.length > 1 ? `${cls.title} (part ${i + 1})` : cls.title, source_type: "zoho", zoho_recording_id: r.id,
      source_url: null, storage_path: null, duration_seconds: r.durationMs ? Math.round(r.durationMs / 1000) : null,
    }).select("id");
    if (error && error.code !== "23505") throw new Error("Could not save recording link");
    if (data?.length) {
      linked++;
      await db.from("audit_events").insert({ actor_id: actorId, action: "recording_linked", entity_type: "class", entity_id: cls.id, after_data: { zoho_recording_id: r.id } });
    }
  }
  return { found: recs.length, linked, generating: recs.length - ready.length };
}
