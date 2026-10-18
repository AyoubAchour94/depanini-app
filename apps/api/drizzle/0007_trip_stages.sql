ALTER TABLE "tow_requests" ADD COLUMN "trip_stage" text;--> statement-breakpoint
ALTER TABLE "tow_requests" ADD COLUMN "en_route_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tow_requests" ADD COLUMN "arrived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tow_requests" ADD COLUMN "towing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tow_requests" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tow_requests" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "tow_requests" ADD COLUMN "cancel_reason" text;