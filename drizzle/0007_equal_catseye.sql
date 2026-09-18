DROP INDEX "pmf_app_version_idx";--> statement-breakpoint
ALTER TABLE "pmf_documents" ADD COLUMN "framework" text DEFAULT 'conversation' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "pmf_app_framework_version_idx" ON "pmf_documents" USING btree ("app_id","framework","version");