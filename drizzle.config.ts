import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated, reviewed and committed — never `drizzle-kit push`,
 * which can resolve a rename by dropping the column, and these tables hold
 * history that exists nowhere else once a device is wiped.
 *
 *   npx drizzle-kit generate   # write the SQL
 *   npx drizzle-kit migrate    # apply it
 */
export default defineConfig({
  dialect: "postgresql",
  // Separate modules, one migration history — see `lib/server/auth-schema.ts`.
  schema: ["./lib/server/schema.ts", "./lib/server/auth-schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
