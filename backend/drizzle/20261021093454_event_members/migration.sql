CREATE TABLE "event_members" (
	"event_id" integer,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_members_pkey" PRIMARY KEY("event_id","user_id")
);
