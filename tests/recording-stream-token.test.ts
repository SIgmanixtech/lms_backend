import { beforeAll, describe, expect, it } from "vitest";
import { signRecordingTicket, verifyRecordingTicket } from "@backend/server/meetings/recording-stream-token.server";

const rec = "2a04a9f6-b32b-4098-b677-279d3ce22787", user = "0a41d61f-68a5-4e18-a4fe-a6cc631ae651";
beforeAll(() => { process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key"; });

describe("recording stream tickets", () => {
  it("accepts a fresh ticket for the recording it was issued for", async () => {
    expect(await verifyRecordingTicket(await signRecordingTicket(rec, user))).toBe(rec);
  });
  it("rejects expired tickets", async () => {
    const t = await signRecordingTicket(rec, user, Date.now() - 5 * 3600_000);
    expect(await verifyRecordingTicket(t)).toBeNull();
  });
  it("rejects tampered tickets (another recording id)", async () => {
    const t = await signRecordingTicket(rec, user);
    expect(await verifyRecordingTicket(t.replace(rec, "11111111-1111-1111-1111-111111111111"))).toBeNull();
  });
  it("rejects garbage", async () => { expect(await verifyRecordingTicket("abc")).toBeNull(); });
});
