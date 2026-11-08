-- Hand-written preamble: extension, then data repairs that must run before the
-- constraints below can be created.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- PBI 17: one review per user per tea. Keep the newest, drop older rows (review_tags cascade).
-- Nothing is lost: the doomed rows (including photo_url, so blobs stay
-- recoverable) and their tag links are copied to backup tables first. Drop them
-- by hand once you are sure they are not needed.
CREATE TABLE "reviews_dedupe_backup" AS SELECT * FROM "reviews" WHERE "id" IN (
	SELECT "id" FROM (
		SELECT "id", row_number() OVER (PARTITION BY "user_id", "tea_id" ORDER BY "created_at" DESC NULLS LAST, "id" DESC) AS rn
		FROM "reviews"
	) ranked WHERE rn > 1
);--> statement-breakpoint
CREATE TABLE "review_tags_dedupe_backup" AS SELECT * FROM "review_tags" WHERE "review_id" IN (SELECT "id" FROM "reviews_dedupe_backup");--> statement-breakpoint
DELETE FROM "review_tags" WHERE "review_id" IN (
	SELECT "id" FROM (
		SELECT "id", row_number() OVER (PARTITION BY "user_id", "tea_id" ORDER BY "created_at" DESC NULLS LAST, "id" DESC) AS rn
		FROM "reviews"
	) ranked WHERE rn > 1
);--> statement-breakpoint
DELETE FROM "reviews" WHERE "id" IN (
	SELECT "id" FROM (
		SELECT "id", row_number() OVER (PARTITION BY "user_id", "tea_id" ORDER BY "created_at" DESC NULLS LAST, "id" DESC) AS rn
		FROM "reviews"
	) ranked WHERE rn > 1
);--> statement-breakpoint
UPDATE "reviews" SET "score" = LEAST(100, GREATEST(0, "score")) WHERE "score" < 0 OR "score" > 100;--> statement-breakpoint
-- PBI 30: unique brand names. Repoint teas to the oldest brand with the same name.
UPDATE "teas" SET "brand_id" = keep."keep_id"
FROM (
	SELECT b."id" AS dup_id, MIN(b2."id") AS keep_id
	FROM "brands" b JOIN "brands" b2 ON b2."name" = b."name"
	GROUP BY b."id"
) keep
WHERE "teas"."brand_id" = keep.dup_id AND keep.keep_id <> keep.dup_id;--> statement-breakpoint
DELETE FROM "brands" WHERE "id" NOT IN (SELECT MIN("id") FROM "brands" GROUP BY "name");--> statement-breakpoint
-- PBI 30: backfill NULLs before the NOT NULL constraints.
UPDATE "users" SET "is_premium" = false WHERE "is_premium" IS NULL;--> statement-breakpoint
UPDATE "users" SET "profile_public" = true WHERE "profile_public" IS NULL;--> statement-breakpoint
UPDATE "users" SET "is_admin" = false WHERE "is_admin" IS NULL;--> statement-breakpoint
UPDATE "users" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "teas" SET "review_count" = 0 WHERE "review_count" IS NULL;--> statement-breakpoint
UPDATE "teas" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "brands" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "reviews" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "favorites" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "wishlist" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "accounts" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "affiliate_links" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "tea_requests" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "tea_requests" SET "status" = 'pending' WHERE "status" IS NULL;--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_id" integer NOT NULL,
	"reporter_user_id" integer NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" integer
);
--> statement-breakpoint
ALTER TABLE "affiliate_links" DROP CONSTRAINT "affiliate_links_tea_id_teas_id_fk";
--> statement-breakpoint
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_tea_id_teas_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_tea_id_teas_id_fk";
--> statement-breakpoint
ALTER TABLE "tea_requests" DROP CONSTRAINT "tea_requests_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "wishlist" DROP CONSTRAINT "wishlist_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "wishlist" DROP CONSTRAINT "wishlist_tea_id_teas_id_fk";
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate_links" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_events" ALTER COLUMN "processed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_events" ALTER COLUMN "processed_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tea_requests" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tea_requests" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teas" ALTER COLUMN "review_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teas" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_premium" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "profile_public" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_admin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wishlist" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tea_requests" ADD COLUMN "created_tea_id" integer;--> statement-breakpoint
ALTER TABLE "tea_requests" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_at" timestamp;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_review_id_reporter_user_id_idx" ON "reports" USING btree ("review_id","reporter_user_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tea_requests" ADD CONSTRAINT "tea_requests_created_tea_id_teas_id_fk" FOREIGN KEY ("created_tea_id") REFERENCES "public"."teas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tea_requests" ADD CONSTRAINT "tea_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_links_tea_id_idx" ON "affiliate_links" USING btree ("tea_id");--> statement-breakpoint
CREATE INDEX "brands_name_trgm_idx" ON "brands" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "review_tags_flavor_tag_id_idx" ON "review_tags" USING btree ("flavor_tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_user_id_tea_id_idx" ON "reviews" USING btree ("user_id","tea_id");--> statement-breakpoint
CREATE INDEX "reviews_tea_id_created_at_idx" ON "reviews" USING btree ("tea_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reviews_user_id_created_at_idx" ON "reviews" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tea_requests_status_idx" ON "tea_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "teas_type_leaf_score_idx" ON "teas" USING btree ("type","leaf_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "teas_brand_id_idx" ON "teas" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "teas_created_at_idx" ON "teas" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "teas_name_trgm_idx" ON "teas" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_score_range" CHECK ("reviews"."score" >= 0 and "reviews"."score" <= 100);
--> statement-breakpoint
-- PBI 17: recompute stored scores after the dedupe.
UPDATE "teas" SET
	"leaf_score" = (SELECT avg("score") FROM "reviews" WHERE "reviews"."tea_id" = "teas"."id" AND NOT "reviews"."hidden"),
	"review_count" = (SELECT count(*) FROM "reviews" WHERE "reviews"."tea_id" = "teas"."id" AND NOT "reviews"."hidden");--> statement-breakpoint
-- PBI 20: magic-link signups used the email local part as a public name; replace it.
-- Only users with no linked OAuth account (magic-link only); a Google user who
-- really is called "alex" keeps their name.
UPDATE "users" SET "name" = 'Tea drinker ' || lpad((floor(random() * 10000))::int::text, 4, '0')
WHERE lower("name") = lower(split_part("email", '@', 1))
	AND NOT EXISTS (SELECT 1 FROM "accounts" WHERE "accounts"."user_id" = "users"."id");--> statement-breakpoint
-- PBI 33: existing claims were only written after handling, so they are processed.
UPDATE "stripe_events" SET "processed_at" = now() WHERE "processed_at" IS NULL;
