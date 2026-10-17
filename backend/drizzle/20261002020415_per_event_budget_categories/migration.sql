-- Budget categories move from club scope to event scope, and absorb event_budgets allocations.
-- Existing club categories are cloned into every event that references them (via an allocation
-- or an expense), and expenses are repointed at the event-local clone.
ALTER TABLE "budget_categories" DROP CONSTRAINT "budget_categories_club_id_name_unique";--> statement-breakpoint
ALTER TABLE "budget_categories" ADD COLUMN "event_id" integer;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD COLUMN "allocated_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD COLUMN "source_category_id" integer;--> statement-breakpoint
INSERT INTO "budget_categories" ("club_id", "event_id", "name", "allocated_amount", "source_category_id", "created_at")
SELECT bc."club_id", usage."event_id", bc."name", COALESCE(eb."allocated_amount", 0), bc."id", bc."created_at"
FROM (
    SELECT "event_id", "category_id" FROM "event_budgets"
    UNION
    SELECT "event_id", "category_id" FROM "expenses"
) AS usage
JOIN "budget_categories" bc ON bc."id" = usage."category_id"
LEFT JOIN "event_budgets" eb ON eb."event_id" = usage."event_id" AND eb."category_id" = usage."category_id";--> statement-breakpoint
UPDATE "expenses" e
SET "category_id" = clone."id"
FROM "budget_categories" clone
WHERE clone."source_category_id" = e."category_id" AND clone."event_id" = e."event_id";--> statement-breakpoint
DELETE FROM "budget_categories" WHERE "event_id" IS NULL;--> statement-breakpoint
ALTER TABLE "budget_categories" DROP COLUMN "source_category_id";--> statement-breakpoint
ALTER TABLE "budget_categories" DROP COLUMN "club_id";--> statement-breakpoint
ALTER TABLE "budget_categories" ALTER COLUMN "event_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_event_id_name_unique" UNIQUE("event_id","name");--> statement-breakpoint
DROP TABLE "event_budgets";
