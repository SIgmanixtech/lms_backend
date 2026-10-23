import { AppError } from "@/lib/errors";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+?";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(set: string): string {
  // Rejection sampling avoids modulo bias.
  const max = 256 - (256 % set.length);
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < max) return set[buf[0]! % set.length]!;
  }
}

/** Cryptographically random 16-character temporary password. Never logged or stored. */
export function generateTemporaryPassword(length = 16): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Number.parseInt(pick("0123456789abcdef") + pick("0123456789abcdef"), 16) % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/** Confirms the caller is an active admin using their own RLS-scoped client. */
export async function assertActiveAdmin(
  client: { from: (t: "profiles") => any },
  userId: string,
): Promise<void> {
  const { data } = await client.from("profiles").select("role, account_status").eq("id", userId).maybeSingle();
  if (!data || data.role !== "admin" || data.account_status !== "active") throw new AppError("AUTHORIZATION_ERROR");
}
