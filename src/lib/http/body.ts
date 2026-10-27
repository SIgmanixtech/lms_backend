import { AppError } from "@/lib/errors";

export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

/** Reads a JSON body, refusing non-JSON content types and bodies over `maxBytes` (checked while streaming). */
export async function readJson(request: Request, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new AppError("VALIDATION_ERROR", "The request is too large.");
  if (!request.body) return {};
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) throw new AppError("VALIDATION_ERROR", "Send the request as JSON.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AppError("VALIDATION_ERROR", "The request is too large.");
    }
    chunks.push(value);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("VALIDATION_ERROR", "The request body isn't valid JSON.");
  }
}

/** Reads any body as bytes (file uploads, PostgREST JSON), refusing bodies over `maxBytes` (checked while streaming). */
export async function readRaw(request: Request, maxBytes: number): Promise<ArrayBuffer | undefined> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new AppError("VALIDATION_ERROR", "The request is too large.");
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AppError("VALIDATION_ERROR", "The request is too large.");
    }
    chunks.push(value);
  }
  if (size === 0) return undefined;
  const buf = Buffer.concat(chunks);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
