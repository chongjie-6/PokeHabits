import { describe, expect, it } from "vitest";
import { readJson, readText } from "@/lib/server/json";

/** A body with no `Content-Length`, which is what a size check on the header misses. */
function chunked(...parts: string[]): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  return new Request("https://openhabits.example/api/sync", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
}

describe("readJson", () => {
  it("parses a body within the limit", async () => {
    expect(await readJson(chunked('{"a":', "1}"), 64)).toEqual({ a: 1 });
  });

  it("gives up on a body past the limit, however it was sent", async () => {
    expect(
      await readJson(chunked('{"a":"', "x".repeat(100), '"}'), 64),
    ).toBeUndefined();
  });

  it("reads `null` as a value, not as a failure", async () => {
    expect(await readJson("null")).toBeNull();
    expect(await readJson("{")).toBeUndefined();
  });

  it("decodes a character split across two chunks", async () => {
    const bytes = new TextEncoder().encode('"✅"');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });
    const request = new Request("https://openhabits.example/", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    expect(await readText(request, 64)).toBe('"✅"');
  });
});
