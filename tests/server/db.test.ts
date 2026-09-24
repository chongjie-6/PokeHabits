import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/server/db";

const globalForDb = globalThis as unknown as {
  openHabitsSql?: { options: { max: number }; end: () => Promise<void> };
};

afterEach(async () => {
  await globalForDb.openHabitsSql?.end();
  delete globalForDb.openHabitsSql;
});

describe("the connection pool", () => {
  // postgres.js connects lazily, so this builds the client without a server.
  it("lets one instance run requests side by side", () => {
    process.env.DATABASE_URL ??=
      "postgres://openhabits:x@127.0.0.1:1/openhabits";
    getDb();
    expect(globalForDb.openHabitsSql?.options.max).toBeGreaterThan(1);
  });
});
