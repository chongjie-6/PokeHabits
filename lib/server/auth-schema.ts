/**
 * Better Auth's own tables. See DESIGN.md §13.6. `user` is the identity it
 * owns; `users` in `schema.ts` is the account sync rows cascade from, and
 * merging them would hand a dependency's migrations authority over years of
 * history. Same id, no foreign key, linked by the upsert in `sync-store.ts`.
 *
 * Field *names* must match Better Auth's model exactly — the adapter looks up
 * properties by name — so re-read them on upgrade.
 */

import { boolean, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Their own Postgres schema (§13.8 #9), because one letter is not enough to
 * carry the separation: in a `psql` prompt `user` and `users` are a typo apart,
 * and the wrong one is the table every habit cascades from. `pgSchema` rather
 * than a prefix because the ownership is real.
 */
const authSchema = pgSchema("auth");
const pgTable = authSchema.table;

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt,
  updatedAt,
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** The opaque value in the session cookie. Unique because it is looked up by. */
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt,
  updatedAt,
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** The provider's id: an OAuth `sub`, or the user id for credentials. */
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  issuer: text("issuer").notNull(),
  /** Set for credential accounts only, and already hashed by Better Auth (scrypt). */
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  createdAt,
  updatedAt,
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
  updatedAt,
});
