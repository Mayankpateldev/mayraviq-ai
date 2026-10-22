/** Shared boundary for authenticated JSON mutations; authorization stays in each domain. */
export const MAX_JSON_BYTES = 256 * 1024;
export class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export function apiReply(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Authorization, x-workspace-id",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}
export async function readMutation(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  // Do not trust sibling sites: membership uses the authenticated browser identity.
  if (origin && origin !== new URL(request.url).origin)
    throw new RequestError("Request origin is not allowed.", 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new RequestError("Use application/json for this request.", 415);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES)
    throw new RequestError("Request is too large.", 413);
  if (!request.body) throw new RequestError("Invalid request.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new RequestError("Request is too large.", 413);
      }
      chunks.push(value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("Invalid request.", 400);
  } finally {
    reader.releaseLock();
  }
}
export function requestFailure(error: unknown) {
  return error instanceof RequestError
    ? apiReply({ error: error.message }, error.status)
    : apiReply({ error: "Invalid request." }, 400);
}
