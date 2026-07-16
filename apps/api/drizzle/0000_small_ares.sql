CREATE TABLE "audit_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"role" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status" integer,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "org_hospitals" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"beds_total" integer DEFAULT 0 NOT NULL,
	"beds_occupied" integer DEFAULT 0 NOT NULL,
	"lng" double precision,
	"lat" double precision,
	"location" geometry(Point,4326)
);
--> statement-breakpoint
CREATE TABLE "org_units" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"zone_id" text,
	"readiness" integer DEFAULT 0 NOT NULL,
	"lng" double precision,
	"lat" double precision,
	"location" geometry(Point,4326)
);
--> statement-breakpoint
CREATE TABLE "org_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission_id" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"scope_type" text DEFAULT 'national' NOT NULL,
	"scope_id" text,
	CONSTRAINT "user_roles_user_id_role_scope_type_pk" PRIMARY KEY("user_id","role","scope_type")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keycloak_id" text,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_keycloak_id_unique" UNIQUE("keycloak_id")
);
--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_zone_id_org_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."org_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_roles_id_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;