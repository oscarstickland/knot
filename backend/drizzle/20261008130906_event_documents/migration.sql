CREATE TABLE "event_documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"url" varchar(2048) NOT NULL,
	"added_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
