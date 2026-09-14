-- ARGOS / IRIS — extensions créées à la PREMIÈRE initialisation de la base
-- (docker-entrypoint-initdb.d). L'image timescale/timescaledb-ha fournit
-- PostGIS et TimescaleDB ; les migrations Drizzle (apps/api/drizzle) supposent
-- PostGIS présent (colonnes geometry(Point,4326)).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
