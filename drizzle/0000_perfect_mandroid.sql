CREATE SEQUENCE "public"."hapi_sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "entries" (
	"user_id" text NOT NULL,
	"habit_id" text NOT NULL,
	"date" text NOT NULL,
	"count" integer NOT NULL,
	"updated_at" bigint NOT NULL,
	"seq" bigint NOT NULL,
	CONSTRAINT "entries_user_id_habit_id_date_pk" PRIMARY KEY("user_id","habit_id","date")
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"color" text NOT NULL,
	"cadence" jsonb NOT NULL,
	"target" integer NOT NULL,
	"order" integer NOT NULL,
	"created_at" text NOT NULL,
	"archived_at" text,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"seq" bigint NOT NULL,
	CONSTRAINT "habits_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" bigint NOT NULL,
	"seq" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_habit_fk" FOREIGN KEY ("user_id","habit_id") REFERENCES "public"."habits"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_user_seq_idx" ON "entries" USING btree ("user_id","seq");--> statement-breakpoint
CREATE INDEX "habits_user_seq_idx" ON "habits" USING btree ("user_id","seq");