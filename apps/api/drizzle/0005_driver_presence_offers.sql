CREATE TABLE "driver_presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"location" geography(Point, 4326),
	"location_updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tow_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"fare_tnd" integer NOT NULL,
	"distance_to_pickup_m" integer NOT NULL,
	"eta_min" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tow_requests" ADD COLUMN "assigned_driver_id" uuid;--> statement-breakpoint
ALTER TABLE "tow_requests" ADD COLUMN "agreed_fare_tnd" integer;--> statement-breakpoint
ALTER TABLE "tow_requests" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "driver_presence" ADD CONSTRAINT "driver_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tow_offers" ADD CONSTRAINT "tow_offers_request_id_tow_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."tow_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tow_offers" ADD CONSTRAINT "tow_offers_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_presence_location_idx" ON "driver_presence" USING gist ("location");--> statement-breakpoint
CREATE INDEX "tow_offers_request_idx" ON "tow_offers" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "tow_offers_driver_idx" ON "tow_offers" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tow_offers_one_pending_per_driver_idx" ON "tow_offers" USING btree ("request_id","driver_id") WHERE "tow_offers"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "tow_requests" ADD CONSTRAINT "tow_requests_assigned_driver_id_users_id_fk" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;