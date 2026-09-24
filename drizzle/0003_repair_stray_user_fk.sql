-- Drops a foreign key `user.id -> users.id` that no migration ever created: it
-- reached at least one database through `drizzle-kit push` and contradicts
-- lib/server/auth-schema.ts, which keeps the two tables deliberately unlinked.
-- With it in place every sign-up fails, because Better Auth inserts the identity
-- row before the first sync upserts the account row it would point at.
-- `IF EXISTS` because most databases never had it.
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_users_fk";
