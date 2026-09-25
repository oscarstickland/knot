CREATE TABLE "event_attendance" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_attendance_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event_id" integer NOT NULL,
	"name" varchar(250) NOT NULL,
	"email" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "attendance_open" boolean DEFAULT false NOT NULL;