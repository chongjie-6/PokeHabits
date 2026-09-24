import "server-only";

/**
 * The parsed body, or `undefined` if it is not JSON — free to mean failure
 * because no JSON text parses to it. The caller answers it, the routes
 * disagreeing on the shape of a 400. Past `maxBytes` also reads as failure:
 * `Content-Length` is only what the caller *declared*, and a chunked request
 * declares nothing while `request.json()` buffers whatever arrives.
 */
export async function readJson(
  source: Request | string,
  maxBytes = Infinity,
): Promise<unknown> {
  try {
    const text =
      typeof source === "string" ? source : await readText(source, maxBytes);
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The body as text, or null once it passes `maxBytes` — read no further than that. */
export async function readText(
  request: Request,
  maxBytes = Infinity,
): Promise<string | null> {
  if (!request.body) return "";
  if (maxBytes === Infinity) return request.text();

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}
