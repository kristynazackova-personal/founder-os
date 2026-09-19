CREATE TABLE "pmf_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"framework" text NOT NULL,
	"field" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"message" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pmf_jobs" ADD CONSTRAINT "pmf_jobs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pmf_jobs_app_idx" ON "pmf_jobs" USING btree ("app_id","created_at");