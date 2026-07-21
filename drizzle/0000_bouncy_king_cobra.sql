CREATE TABLE "affiliate_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"tea_id" integer NOT NULL,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"logo_url" text,
	"country" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" integer NOT NULL,
	"tea_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "flavor_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "flavor_tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "review_tags" (
	"review_id" integer NOT NULL,
	"flavor_tag_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tea_id" integer NOT NULL,
	"score" integer NOT NULL,
	"brew_method" text,
	"brew_temp" integer,
	"steep_time" integer,
	"notes" text,
	"photo_url" text,
	"would_drink_again" boolean,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tea_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"type" text,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand_id" integer,
	"type" text NOT NULL,
	"subtype" text,
	"origin" text,
	"caffeine_level" text,
	"leaf_style" text,
	"image_url" text,
	"leaf_score" real,
	"review_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar_url" text,
	"is_premium" boolean DEFAULT false,
	"stripe_customer_id" text,
	"premium_expires_at" timestamp,
	"profile_public" boolean DEFAULT true,
	"is_admin" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wishlist" (
	"user_id" integer NOT NULL,
	"tea_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tags" ADD CONSTRAINT "review_tags_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tags" ADD CONSTRAINT "review_tags_flavor_tag_id_flavor_tags_id_fk" FOREIGN KEY ("flavor_tag_id") REFERENCES "public"."flavor_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tea_requests" ADD CONSTRAINT "tea_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teas" ADD CONSTRAINT "teas_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_id_tea_id_idx" ON "favorites" USING btree ("user_id","tea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_tags_review_id_flavor_tag_id_idx" ON "review_tags" USING btree ("review_id","flavor_tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_user_id_tea_id_idx" ON "wishlist" USING btree ("user_id","tea_id");