-- Additive only. To undo: DROP TABLE "document_uploads";
CREATE TABLE "document_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_uploads_driver_created_idx" ON "document_uploads" USING btree ("driver_id","created_at");
--> statement-breakpoint
-- Carry over the last day of uploads so the limit does not reset at deploy.
INSERT INTO "document_uploads" ("driver_id", "created_at")
SELECT "owner_user_id", "created_at" FROM "files" WHERE "created_at" > now() - interval '1 day';
