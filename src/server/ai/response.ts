import "server-only";
/** Bound bytes before decoding malformed or streamed upstream content. */
export async function providerJson(response: Response, maximumBytes = 64_000): Promise<unknown> {
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("provider_empty");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new Error("provider_oversize");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
