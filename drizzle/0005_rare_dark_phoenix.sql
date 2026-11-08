ALTER TABLE "affiliate_links" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD COLUMN "price_per_100g_cents" integer;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD COLUMN "click_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_last_sent_at" timestamp with time zone;