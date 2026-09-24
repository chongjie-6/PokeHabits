-- Move Better Auth's four tables out of `public` and into their own schema.
-- See DESIGN.md §13.8 #9 and the header of lib/server/auth-schema.ts.
--
-- Hand-written, and it had to be. drizzle-kit cannot tell a table that moved
-- schema from one dropped here and created there, so it asks — and the answer it
-- takes without asking is the destructive one. These tables hold every identity,
-- every credential hash and every live session on the deployment; `SET SCHEMA`
-- moves the rows, indexes, constraints and sequences with them and copies
-- nothing.
--
-- `IF EXISTS` throughout so this is a no-op on a database that was created after
-- the move rather than migrated into it.
CREATE SCHEMA IF NOT EXISTS "auth";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."user" SET SCHEMA "auth";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."session" SET SCHEMA "auth";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."account" SET SCHEMA "auth";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."verification" SET SCHEMA "auth";
