/**
 * Pure HTTP Range rules for the recording stream proxy. No I/O.
 *
 * Every upstream request is an explicit, bounded `bytes=start-end` range because:
 * - Zoho answers suffix ranges (`bytes=-N`) with a malformed Content-Range and a Content-Length
 *   larger than the file, which breaks the proxied connection mid-response.
 * - Serverless hosts cap function duration (and may buffer bodies), so one open-ended
 *   request for a 100+ MB MP4 can be cut off. Browsers' media players request the next
 *   range on their own when a 206 response is shorter than asked.
 */
export const STREAM_CHUNK_BYTES = 4 * 1024 * 1024 - 64 * 1024; // stays under 4.5 MB response caps

export type RangePlan =
  | { kind: "range"; start: number; end: number | null }
  | { kind: "needs_size"; suffix: number }
  | { kind: "unsatisfiable" };

/** Parses a single-range `Range` header. Missing or unparseable → from byte 0 (multi-range is not supported). */
export function planRange(header: string | null, total: number | null, chunk = STREAM_CHUNK_BYTES): RangePlan {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? "").trim());
  let start = 0, end: number | null = null;
  if (m && (m[1] !== "" || m[2] !== "")) {
    if (m[1] === "") {
      const suffix = Number(m[2]);
      if (!suffix) return { kind: "unsatisfiable" };
      if (total == null) return { kind: "needs_size", suffix };
      start = Math.max(0, total - suffix);
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? null : Number(m[2]);
      if (end != null && end < start) return { kind: "unsatisfiable" };
    }
  }
  if (total != null && start >= total) return { kind: "unsatisfiable" };
  const cap = start + chunk - 1;
  end = Math.min(end ?? cap, cap);
  if (total != null) end = Math.min(end, total - 1);
  return { kind: "range", start, end };
}

/** Total size from a well-formed `Content-Range: bytes a-b/total`; null when absent or malformed. */
export function totalFromContentRange(value: string | null): number | null {
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec((value ?? "").trim());
  return m ? Number(m[3]) : null;
}

/** True for a top-level browser navigation (tab), which gets the player page instead of raw bytes. */
export function wantsPlayerPage(accept: string | null, range: string | null, raw: boolean): boolean {
  return !raw && !range && /\btext\/html\b/.test(accept ?? "");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal private player page. The <video> fetches the same ticketed URL with `raw=1` and Range. */
export function playerPage(title: string, mediaUrl: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>html,body{margin:0;height:100%;background:#0b0b0c;color:#e8e8ea;font:14px system-ui,sans-serif}main{display:flex;flex-direction:column;height:100%}h1{font-size:15px;font-weight:600;margin:0;padding:12px 16px}video{flex:1;width:100%;min-height:0;background:#000}</style></head>
<body><main><h1>${esc(title)}</h1><video src="${esc(mediaUrl)}" controls autoplay playsinline preload="metadata" controlslist="nodownload"></video></main></body></html>`;
}
