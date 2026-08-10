ALTER TABLE "events" ADD COLUMN "start_time" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "end_time" timestamp with time zone NOT NULL;