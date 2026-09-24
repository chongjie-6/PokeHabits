-- Row-level security on the five tables that hold account data. See
-- DESIGN.md §13.15 and `lib/server/scope.ts`.
--
-- The `ENABLE` and `CREATE POLICY` statements below are generated from
-- `lib/server/schema.ts`; the `FORCE` statements at the end are not, and are
-- the reason this file is edited by hand. **Without them this migration is
-- decorative**: RLS does not apply to a table's owner, and the role in
-- `DATABASE_URL` is the role that ran the migrations that created these
-- tables. `FORCE ROW LEVEL SECURITY` is what makes the policies bind the owner
-- too. drizzle-kit has no way to express it, so it will neither generate these
-- lines nor notice if they go missing — which is what the last statement here
-- is for.

ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "habits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "entries_owner" ON "entries" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('openhabits.user_id', true)) WITH CHECK (user_id = current_setting('openhabits.user_id', true));--> statement-breakpoint
CREATE POLICY "habits_owner" ON "habits" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('openhabits.user_id', true)) WITH CHECK (user_id = current_setting('openhabits.user_id', true));--> statement-breakpoint
CREATE POLICY "push_subscriptions_owner" ON "push_subscriptions" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('openhabits.user_id', true)) WITH CHECK (user_id = current_setting('openhabits.user_id', true));--> statement-breakpoint
CREATE POLICY "push_subscriptions_server" ON "push_subscriptions" AS PERMISSIVE FOR ALL TO public USING (current_setting('openhabits.scope', true) = 'server') WITH CHECK (current_setting('openhabits.scope', true) = 'server');--> statement-breakpoint
CREATE POLICY "settings_owner" ON "settings" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('openhabits.user_id', true)) WITH CHECK (user_id = current_setting('openhabits.user_id', true));--> statement-breakpoint
CREATE POLICY "settings_server" ON "settings" AS PERMISSIVE FOR SELECT TO public USING (current_setting('openhabits.scope', true) = 'server');--> statement-breakpoint
CREATE POLICY "users_owner" ON "users" AS PERMISSIVE FOR ALL TO public USING (id = current_setting('openhabits.user_id', true)) WITH CHECK (id = current_setting('openhabits.user_id', true));--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "habits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- A superuser, or any role with BYPASSRLS, ignores every policy above and every
-- FORCE beside it — silently, with no error and no wrong-looking query. That is
-- the one failure mode this whole section cannot detect at runtime, so it is
-- said here, at the moment a human is watching the output. A warning rather
-- than an exception: the test suite runs these migrations under PGlite, whose
-- only role is a superuser, and refusing to migrate there would trade a real
-- deployment's safety net for no test suite at all.
DO $$
BEGIN
  IF current_setting('is_superuser') = 'on' THEN
    RAISE WARNING 'openhabits: migrating as a superuser, which bypasses row-level security. Point DATABASE_URL at an ordinary role, or the policies in this migration do nothing (DESIGN.md 13.15).';
  END IF;
END
$$;
