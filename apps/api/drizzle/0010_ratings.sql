CREATE TABLE "ratings" (
	"request_id" uuid NOT NULL,
	"rater_role" text NOT NULL,
	"ratee_user_id" uuid NOT NULL,
	"stars" smallint NOT NULL,
	"tags" text[] NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_request_id_rater_role_pk" PRIMARY KEY("request_id","rater_role"),
	CONSTRAINT "ratings_stars_check" CHECK ("ratings"."stars" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_request_id_tow_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."tow_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ratee_user_id_users_id_fk" FOREIGN KEY ("ratee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ratings_ratee_idx" ON "ratings" USING btree ("ratee_user_id","rater_role");