CREATE SEQUENCE "public"."receipt_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "payments" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"amount_tnd" integer NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"status" text DEFAULT 'driver_confirmed' NOT NULL,
	"receipt_no" text NOT NULL,
	"driver_confirmed_at" timestamp with time zone NOT NULL,
	"customer_answered_at" timestamp with time zone,
	"dispute_note" text,
	CONSTRAINT "payments_receipt_no_unique" UNIQUE("receipt_no")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_request_id_tow_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."tow_requests"("id") ON DELETE cascade ON UPDATE no action;