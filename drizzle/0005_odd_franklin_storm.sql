ALTER TABLE "apps" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "nature" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "gates" jsonb;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "gates_generated_at" timestamp with time zone;