import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import scheduler from "@/workers/reminders";

const ENV = { SITE_URL: "https://openhabits.example", CRON_SECRET: "s3cret" };

/** The Worker takes `(controller, env)` and ignores the first. */
function run(env: Record<string, string>) {
  return scheduler.scheduled(undefined, env);
}

function respond(status: number, body = "{}") {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The stub declares no parameters, so its recorded call needs naming. */
function calledWith(fetchMock: Mock): [string, RequestInit] {
  return fetchMock.mock.calls[0] as unknown as [string, RequestInit];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the reminder scheduler", () => {
  it("calls the sweep with the bearer", async () => {
    const fetchMock = respond(200, JSON.stringify({ sent: 0 }));
    await run(ENV);

    const [url, init] = calledWith(fetchMock);
    expect(url).toBe("https://openhabits.example/api/cron/reminders");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer s3cret",
    );
  });

  it("does not double the slash on a trailing-slash origin", async () => {
    const fetchMock = respond(200);
    await run({ ...ENV, SITE_URL: "https://openhabits.example/" });

    expect(calledWith(fetchMock)[0]).toBe(
      "https://openhabits.example/api/cron/reminders",
    );
  });

  // The whole point of the Worker: a throw is what marks the cron invocation
  // failed, and a sweep that answers 401 has to be louder than one that ran.
  it.each([401, 500, 503])("throws on %i", async (status) => {
    respond(status, "nope");
    await expect(run(ENV)).rejects.toThrow(String(status));
  });

  it.each([
    ["SITE_URL", { ...ENV, SITE_URL: "" }],
    ["CRON_SECRET", { ...ENV, CRON_SECRET: "" }],
  ])("throws rather than calling anything with no %s", async (_name, env) => {
    const fetchMock = respond(200);
    await expect(run(env)).rejects.toThrow(/unset/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
