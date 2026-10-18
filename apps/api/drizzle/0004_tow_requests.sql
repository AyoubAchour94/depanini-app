CREATE TABLE "tow_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"pickup" geography(Point, 4326) NOT NULL,
	"pickup_address" text NOT NULL,
	"dropoff" geography(Point, 4326) NOT NULL,
	"dropoff_address" text NOT NULL,
	"vehicle_type" text NOT NULL,
	"problem_type" text NOT NULL,
	"note" text,
	"distance_m" integer NOT NULL,
	"suggested_fare_tnd" integer NOT NULL,
	"proposed_fare_tnd" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tow_requests" ADD CONSTRAINT "tow_requests_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tow_requests_pickup_idx" ON "tow_requests" USING gist ("pickup");--> statement-breakpoint
CREATE INDEX "tow_requests_customer_created_idx" ON "tow_requests" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "tow_requests_one_open_per_customer_idx" ON "tow_requests" USING btree ("customer_id") WHERE "tow_requests"."status" = 'open';