-- ============================================================
-- 0001_init — tables mirror prisma/schema.prisma.
-- Hand-written because the schema also needs things Prisma cannot
-- express (generated point column, GiST/trigram indexes, MVs).
-- CI runs `prisma migrate diff` to prove there is no drift.
-- ============================================================

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('HOUSE', 'APARTMENT');

-- CreateTable
CREATE TABLE "sale" (
    "id" BIGSERIAL NOT NULL,
    "department_code" VARCHAR(3) NOT NULL,
    "mutation_id" VARCHAR(32) NOT NULL,
    "date" DATE NOT NULL,
    "year" SMALLINT NOT NULL,
    "commune_code" VARCHAR(5) NOT NULL,
    "street_key" VARCHAR(16) NOT NULL,
    "street_name" VARCHAR(160) NOT NULL,
    "iris_code" VARCHAR(9),
    "property_type" "PropertyType" NOT NULL,
    "surface" SMALLINT NOT NULL,
    "rooms" SMALLINT,
    "value" DECIMAL(14,2) NOT NULL,
    "price_per_m2" REAL NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "geom" point GENERATED ALWAYS AS (point("lon", "lat")) STORED,

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commune" (
    "code" VARCHAR(5) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "department_code" VARCHAR(3) NOT NULL,

    CONSTRAINT "commune_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "iris" (
    "code" VARCHAR(9) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "commune_code" VARCHAR(5) NOT NULL,
    "geometry" JSONB NOT NULL,

    CONSTRAINT "iris_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "import_run" (
    "id" SERIAL NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "department_code" VARCHAR(3) NOT NULL,
    "years" INTEGER[],
    "rows_read" INTEGER NOT NULL DEFAULT 0,
    "mutations_kept" INTEGER NOT NULL DEFAULT 0,
    "rejections" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(16) NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "import_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "iris_code" VARCHAR(9) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_department_code_year_idx" ON "sale"("department_code", "year");
CREATE INDEX "sale_commune_code_year_idx" ON "sale"("commune_code", "year");
CREATE INDEX "sale_iris_code_year_idx" ON "sale"("iris_code", "year");
CREATE INDEX "sale_street_key_idx" ON "sale"("street_key");
CREATE UNIQUE INDEX "sale_department_code_mutation_id_key" ON "sale"("department_code", "mutation_id");
CREATE INDEX "iris_commune_code_idx" ON "iris"("commune_code");
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
CREATE INDEX "session_userId_idx" ON "session"("userId");
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");
CREATE INDEX "account_userId_idx" ON "account"("userId");
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
CREATE UNIQUE INDEX "favorite_user_id_iris_code_key" ON "favorite"("user_id", "iris_code");

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_commune_code_fkey" FOREIGN KEY ("commune_code") REFERENCES "commune"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iris" ADD CONSTRAINT "iris_commune_code_fkey" FOREIGN KEY ("commune_code") REFERENCES "commune"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_iris_code_fkey" FOREIGN KEY ("iris_code") REFERENCES "iris"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Raw SQL beyond Prisma
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() is STABLE, so it cannot be used in an index directly.
-- This IMMUTABLE wrapper pins the dictionary, which makes it indexable.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Fuzzy, accent-insensitive neighbourhood / city search.
CREATE INDEX "iris_name_trgm_idx" ON "iris" USING gin (lower(f_unaccent("name")) gin_trgm_ops);
CREATE INDEX "commune_name_trgm_idx" ON "commune" USING gin (lower(f_unaccent("name")) gin_trgm_ops);

-- Reference window for "current" figures: the 3 most recent years in the data.
CREATE VIEW v_period AS
  SELECT COALESCE(MAX(year), 0) - 2 AS year_from, COALESCE(MAX(year), 0) AS year_to FROM sale;

-- ---- Street medians over the reference period (map layer, zoom >= 13) ----
CREATE MATERIALIZED VIEW mv_street_stats AS
SELECT
  s.street_key,
  s.commune_code,
  MIN(s.street_name)                                                AS street_name,
  mode() WITHIN GROUP (ORDER BY s.iris_code)                        AS iris_code,
  COUNT(*)::int                                                     AS n,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY s.price_per_m2)::real AS median,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY s.price_per_m2)::real AS p25,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY s.price_per_m2)::real AS p75,
  point(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY s.lon),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY s.lat)
  )                                                                 AS geom
FROM sale s, v_period p
WHERE s.year BETWEEN p.year_from AND p.year_to
GROUP BY s.street_key, s.commune_code;

CREATE UNIQUE INDEX mv_street_stats_pk ON mv_street_stats (street_key);
CREATE INDEX mv_street_stats_geom_idx ON mv_street_stats USING gist (geom);

-- ---- Area (commune / IRIS) medians per year and property type (trend chart) ----
-- GROUPING SETS computes every level in one scan; 'ALL' = both property types.
CREATE MATERIALIZED VIEW mv_area_year_stats AS
SELECT
  CASE WHEN GROUPING(s.iris_code) = 0 THEN 'iris' ELSE 'commune' END        AS level,
  COALESCE(s.iris_code, s.commune_code)                                       AS code,
  s.year::int                                                                 AS year,
  COALESCE(s.property_type::text, 'ALL')                                      AS property_type,
  COUNT(*)::int                                                               AS n,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY s.price_per_m2)::real          AS median,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY s.price_per_m2)::real          AS p25,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY s.price_per_m2)::real          AS p75
FROM sale s
GROUP BY GROUPING SETS (
  (s.commune_code, s.year), (s.commune_code, s.year, s.property_type),
  (s.iris_code, s.year),    (s.iris_code, s.year, s.property_type)
)
HAVING NOT (GROUPING(s.iris_code) = 0 AND s.iris_code IS NULL);

CREATE UNIQUE INDEX mv_area_year_stats_pk ON mv_area_year_stats (level, code, property_type, year);

-- ---- Area medians over the reference period (comparison + low-zoom map layer) ----
CREATE MATERIALIZED VIEW mv_area_stats AS
SELECT
  CASE WHEN GROUPING(s.iris_code) = 0 THEN 'iris' ELSE 'commune' END        AS level,
  COALESCE(s.iris_code, s.commune_code)                                       AS code,
  COALESCE(s.property_type::text, 'ALL')                                      AS property_type,
  COUNT(*)::int                                                               AS n,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY s.price_per_m2)::real          AS median,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY s.price_per_m2)::real          AS p25,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY s.price_per_m2)::real          AS p75,
  point(AVG(s.lon), AVG(s.lat))                                               AS geom
FROM sale s, v_period p
WHERE s.year BETWEEN p.year_from AND p.year_to
GROUP BY GROUPING SETS (
  (s.commune_code), (s.commune_code, s.property_type),
  (s.iris_code),    (s.iris_code, s.property_type)
)
HAVING NOT (GROUPING(s.iris_code) = 0 AND s.iris_code IS NULL);

CREATE UNIQUE INDEX mv_area_stats_pk ON mv_area_stats (level, code, property_type);
CREATE INDEX mv_area_stats_geom_idx ON mv_area_stats USING gist (geom) WHERE level = 'commune' AND property_type = 'ALL';
