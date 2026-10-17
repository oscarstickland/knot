ALTER TABLE "expenses" ADD COLUMN "paid_personally" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reimbursed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reimbursed_by" integer;