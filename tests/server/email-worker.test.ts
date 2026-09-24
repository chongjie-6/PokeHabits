import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queue = vi.hoisted(() => ({
  dequeueEmail: vi.fn(),
  completeEmail: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@upstash/qstash", () => ({
  Receiver: class {
    async verify() {
      return true;
    }
  },
}));
vi.mock("@/lib/server/email-queue", () => ({
  dequeueEmail: queue.dequeueEmail,
  completeEmail: queue.completeEmail,
}));
vi.mock("@/lib/email", () => ({ sendEmail: queue.sendEmail }));

const { handleEmailJob } = await import("@/workers/email");

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const JOB = {
  kind: "verification",
  to: "a@example.com",
  url: "https://openhabits.example/x",
};

function job(body: string = JSON.stringify({ id: ID })): Request {
  return new Request("https://openhabits.example/api/email", {
    method: "POST",
    headers: { "upstash-signature": "signed" },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "current");
  vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next");
  queue.dequeueEmail.mockResolvedValue(JOB);
  queue.sendEmail.mockResolvedValue(undefined);
  queue.completeEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("the mail worker", () => {
  it("sends, then clears the envelope", async () => {
    const response = await handleEmailJob(job());
    expect(response.status).toBe(200);
    expect(queue.sendEmail).toHaveBeenCalledWith(JOB);
    expect(queue.completeEmail).toHaveBeenCalledWith(ID);
  });

  it("still answers 200 when the mail went but the envelope would not clear", async () => {
    // A 500 here is QStash's cue to deliver the same mail a second time.
    vi.spyOn(console, "error").mockImplementation(() => {});
    queue.completeEmail.mockRejectedValue(new Error("redis down"));

    const response = await handleEmailJob(job());
    expect(response.status).toBe(200);
    expect(queue.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("asks for a retry when the send itself failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queue.sendEmail.mockRejectedValue(new Error("smtp down"));

    expect((await handleEmailJob(job())).status).toBe(500);
    expect(queue.completeEmail).not.toHaveBeenCalled();
  });

  it("refuses an oversized body before reading all of it", async () => {
    const response = await handleEmailJob(
      job(JSON.stringify({ id: ID, pad: "x".repeat(10_000) })),
    );
    expect(response.status).toBe(413);
    expect(queue.dequeueEmail).not.toHaveBeenCalled();
  });
});
