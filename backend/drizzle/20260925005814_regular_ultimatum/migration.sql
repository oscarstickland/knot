ALTER TABLE "events" ADD COLUMN "slug" varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_slug_key" UNIQUE("slug");