ALTER TYPE "roles" ADD VALUE 'superadmin';--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "club_id" DROP NOT NULL;