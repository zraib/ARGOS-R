CREATE TABLE "work_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"unit" text NOT NULL,
	"assignee" text DEFAULT '' NOT NULL,
	"priority" text NOT NULL,
	"status" text NOT NULL,
	"sla" text NOT NULL,
	"created_label" text NOT NULL,
	"incident_id" text,
	"cancel_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
