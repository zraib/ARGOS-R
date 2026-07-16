// ============================================================================
// ARGOS — schéma de base de données (Drizzle, PostgreSQL 16 + PostGIS)
// Schéma canonique de l'API. Migrations : `npm run db:generate` (SQL depuis ce
// schéma) puis `npm run db:migrate` (contre Postgres). Utilisé par les dépôts
// Drizzle quand DB_DRIVER=postgres ; sinon dépôts in-memory (Phase 0).
// ============================================================================

import { sql } from "drizzle-orm";
import {
  bigserial, boolean, customType, doublePrecision, integer, jsonb,
  pgTable, primaryKey, text, timestamp, uuid,
} from "drizzle-orm/pg-core";

/** Type PostGIS `geometry(Point,4326)` (positions unités/hôpitaux/incidents). */
const geometryPoint = customType<{ data: string }>({
  dataType() {
    return "geometry(Point,4326)";
  },
});

// --- IAM / RBAC ------------------------------------------------------------

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  builtin: boolean("builtin").notNull().default(false),
});

export const permissions = pgTable("permissions", {
  id: text("id").primaryKey(),
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.roleId, t.permissionId] }) }),
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  keycloakId: text("keycloak_id").unique(),
  username: text("username").notNull(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().references(() => roles.id),
    scopeType: text("scope_type").notNull().default("national"),
    scopeId: text("scope_id"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.role, t.scopeType] }) }),
);

// --- Feature flags ---------------------------------------------------------

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

// --- Audit append-only, chaîné par hash ------------------------------------

export const auditLog = pgTable("audit_log", {
  seq: bigserial("seq", { mode: "number" }).primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(),
  role: text("role").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  status: integer("status"),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
  meta: jsonb("meta"),
});

// --- Structure organisationnelle -------------------------------------------

export const orgZones = pgTable("org_zones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const orgUnits = pgTable("org_units", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  zoneId: text("zone_id").references(() => orgZones.id),
  readiness: integer("readiness").notNull().default(0),
  lng: doublePrecision("lng"),
  lat: doublePrecision("lat"),
  location: geometryPoint("location"),
});

export const orgHospitals = pgTable("org_hospitals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  bedsTotal: integer("beds_total").notNull().default(0),
  bedsOccupied: integer("beds_occupied").notNull().default(0),
  lng: doublePrecision("lng"),
  lat: doublePrecision("lat"),
  location: geometryPoint("location"),
});
