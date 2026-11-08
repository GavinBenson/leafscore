CREATE TABLE "brew_infusions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"step" integer NOT NULL,
	"seconds" integer NOT NULL,
	"rating" smallint,
	"note" text,
	CONSTRAINT "brew_infusions_seconds_check" CHECK ("brew_infusions"."seconds" >= 1 and "brew_infusions"."seconds" <= 3600),
	CONSTRAINT "brew_infusions_rating_check" CHECK ("brew_infusions"."rating" is null or ("brew_infusions"."rating" >= 0 and "brew_infusions"."rating" <= 100))
);
--> statement-breakpoint
CREATE TABLE "brew_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tea_id" integer NOT NULL,
	"review_id" integer,
	"method" text,
	"temp_c" integer,
	"grams_used" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cellar_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tea_id" integer NOT NULL,
	"grams" integer NOT NULL,
	"purchased_at" date,
	"price_cents" integer,
	"currency" text,
	"low_stock_grams" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cellar_items_grams_check" CHECK ("cellar_items"."grams" >= 0),
	CONSTRAINT "cellar_items_price_check" CHECK ("cellar_items"."price_cents" is null or "cellar_items"."price_cents" >= 0),
	CONSTRAINT "cellar_items_low_stock_check" CHECK ("cellar_items"."low_stock_grams" is null or "cellar_items"."low_stock_grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"list_id" integer NOT NULL,
	"tea_id" integer NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_helpful_votes" (
	"user_id" integer NOT NULL,
	"review_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_helpful_votes_user_id_review_id_pk" PRIMARY KEY("user_id","review_id")
);
--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "review_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "list_id" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "aroma_score" smallint;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "flavor_score" smallint;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "body_score" smallint;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "aftertaste_score" smallint;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "value_score" smallint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "temp_unit" text DEFAULT 'c' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "weight_unit" text DEFAULT 'g' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blind_tasting" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "brew_infusions" ADD CONSTRAINT "brew_infusions_session_id_brew_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."brew_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_sessions" ADD CONSTRAINT "brew_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_sessions" ADD CONSTRAINT "brew_sessions_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_sessions" ADD CONSTRAINT "brew_sessions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_tea_id_teas_id_fk" FOREIGN KEY ("tea_id") REFERENCES "public"."teas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brew_infusions_session_id_step_idx" ON "brew_infusions" USING btree ("session_id","step");--> statement-breakpoint
CREATE INDEX "brew_sessions_user_id_created_at_idx" ON "brew_sessions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "brew_sessions_tea_id_idx" ON "brew_sessions" USING btree ("tea_id");--> statement-breakpoint
CREATE INDEX "brew_sessions_review_id_idx" ON "brew_sessions" USING btree ("review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cellar_items_user_id_tea_id_idx" ON "cellar_items" USING btree ("user_id","tea_id");--> statement-breakpoint
CREATE INDEX "cellar_items_tea_id_idx" ON "cellar_items" USING btree ("tea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "list_items_list_id_tea_id_idx" ON "list_items" USING btree ("list_id","tea_id");--> statement-breakpoint
CREATE INDEX "list_items_list_id_position_idx" ON "list_items" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "list_items_tea_id_idx" ON "list_items" USING btree ("tea_id");--> statement-breakpoint
CREATE INDEX "lists_user_id_idx" ON "lists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "review_helpful_votes_review_id_idx" ON "review_helpful_votes" USING btree ("review_id");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_list_id_reporter_user_id_idx" ON "reports" USING btree ("list_id","reporter_user_id");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_one_target" CHECK (num_nonnulls("reports"."review_id", "reports"."list_id") = 1);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_aroma_score_range" CHECK ("aroma_score" is null or ("aroma_score" >= 0 and "aroma_score" <= 100));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_flavor_score_range" CHECK ("flavor_score" is null or ("flavor_score" >= 0 and "flavor_score" <= 100));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_body_score_range" CHECK ("body_score" is null or ("body_score" >= 0 and "body_score" <= 100));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_aftertaste_score_range" CHECK ("aftertaste_score" is null or ("aftertaste_score" >= 0 and "aftertaste_score" <= 100));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_value_score_range" CHECK ("value_score" is null or ("value_score" >= 0 and "value_score" <= 100));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_temp_unit_check" CHECK ("users"."temp_unit" in ('c', 'f'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_weight_unit_check" CHECK ("users"."weight_unit" in ('g', 'oz'));