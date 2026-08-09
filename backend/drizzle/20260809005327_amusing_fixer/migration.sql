CREATE TYPE "roles" AS ENUM('standard', 'exec', 'admin');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "roles" DEFAULT 'standard'::"roles";