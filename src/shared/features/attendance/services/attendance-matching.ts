/** Pure participant → student matching. Matches only on the student's verified account email. */
import type { Session } from "./attendance-policy";

export interface RawParticipant { email: string | null; role: string | null; joinTime: number; leaveTime: number }
export interface Unmatched { email: string | null; minutes: number }

export function groupParticipants(participants: RawParticipant[], studentEmails: Set<string>) {
  const byEmail = new Map<string, Session[]>();
  const unmatchedMap = new Map<string, Unmatched>();
  for (const p of participants) {
    const email = p.email?.trim().toLowerCase() || null;
    if (email && studentEmails.has(email)) {
      const list = byEmail.get(email) ?? [];
      list.push({ joinMs: p.joinTime, leaveMs: p.leaveTime });
      byEmail.set(email, list);
      continue;
    }
    if (p.role && /host|presenter|cohost/i.test(p.role)) continue; // tutor/host, not a student
    const key = email ?? `anon-${unmatchedMap.size}`;
    const prev = unmatchedMap.get(key) ?? { email: email ? maskEmail(email) : null, minutes: 0 };
    prev.minutes += Math.round((p.leaveTime - p.joinTime) / 60_000);
    unmatchedMap.set(key, prev);
  }
  return { byEmail, unmatched: [...unmatchedMap.values()] };
}

/** Keeps enough to recognise the person without storing a full external address in audit data. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

/** Class window in epoch ms using the same IST conversion as meeting creation. */
export function classWindowMs(classDate: string, startTime: string, endTime: string): { start: number; end: number } {
  const start = Date.parse(`${classDate}T${startTime.slice(0, 5)}:00+05:30`);
  const end = Date.parse(`${classDate}T${endTime.slice(0, 5)}:00+05:30`);
  return { start, end };
}
