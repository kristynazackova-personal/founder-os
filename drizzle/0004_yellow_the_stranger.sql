CREATE TABLE "ad_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"campaign" text DEFAULT '' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_spend" ADD CONSTRAINT "ad_spend_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_spend_app_campaign_idx" ON "ad_spend" USING btree ("app_id","campaign");