# Decisions

One line per decision: what, and why. Assumption changes (A#) are flagged.

## Data & legal
- **Source = Etalab "DVF géolocalisées"** (`files.data.gouv.fr/geo-dvf/latest/csv/{year}/departements/{dept}.csv.gz`), not the raw DGFiP files — it is the official normalised, geocoded derivative (one file per department, UTF-8, WGS84 coordinates), which removes a geocoding step.
- **Licence**: Licence Ouverte 2.0 (attribution in the footer and README), plus the DVF terms of use: no re-identification of persons and no search-engine indexing → the app only publishes aggregated medians (never single sales) and sends `X-Robots-Tag: noindex` + `robots: noindex` on every page.
- **Years 2021–2025 by default**: geo-dvf currently covers mid-2020 to end-2025; 2020 is partial, so it is excluded from trends.
- **Neighbourhood = INSEE IRIS** — the only national, stable, official sub-communal unit with names. Small communes not split into IRIS count as one IRIS (INSEE convention). *Interpretation of "neighbourhood" logged per protocol.*
- **IRIS polygons from the Opendatasoft `georef-france-iris` GeoJSON export** (IGN/INSEE Contours…IRIS, Licence Ouverte), because the IGN original ships as 7z/Shapefile; the parser also accepts IGN property names, so swapping sources is a flag (`--iris-file`).
- **Synthetic fixtures for dev/CI** (`pnpm db:seed:synthetic`): the build sandbox and CI must not depend on data.gouv.fr availability. Files have the exact geo-dvf layout and go through the same pipeline; runs are tagged `source=synthetic` and the UI shows a banner. Real data needs one command: `pnpm data:import --dept 34`.

## Cleaning & statistics (A3, A4)
- **Only single-dwelling mutations** are kept: DVF repeats the *total* mutation value on every line, so €/m² is only meaningful with exactly one house/apartment (outbuildings allowed, commercial premises excluded).
- **Dwelling dedupe key** = parcel + type + lot + surface + rooms: a house appears once per parcel-culture line.
- **VEFA (off-plan) sales included**, exchanges/auctions/building-land excluded: VEFA is a market sale; the others are not comparable.
- **Hard bounds 200–30 000 €/m² + log-IQR fences (k = 1.5) per department × type × year (n ≥ 30)**: hard bounds remove symbolic €1 sales; log scale because prices are right-skewed; per-department so Paris and rural Lozère are not judged on the same scale.
- **Sales without coordinates are dropped** (≈1–2 %): they cannot be placed on a street or an IRIS. The count is recorded in `import_run.rejections`.
- **Median (percentile_cont), never mean**; IQR (p25–p75) shown alongside to convey spread.
- **MIN_SALES = 10** for every published figure (street, area, area-year, property type). Enforced **server-side** in `applySampleThreshold` so withheld numbers never reach the client; the UI shows "Données insuffisantes" + the sample size.
- **Reference period for "current" figures = 3 most recent years in the data** (view `v_period`): one year is too thin at street level; more years blur the level.
- **A street = (commune, DVF `code_voie`)**, drawn as a circle at the median coordinate of its sales (size ∝ √n). DVF has no street geometry; joining OSM/BAN street lines would add a dataset and a fuzzy matching step for little analytical gain.

## Database (R7)
- **Plain PostgreSQL 16, no PostGIS**: the only spatial needs are bbox lookups on points (native `point` + GiST) and point-in-polygon at import (done in Node with an R-tree). One fewer extension to operate on the VPS.
- **Materialized views** for street / area-year / area-period medians, refreshed `CONCURRENTLY` after each import (unique indexes make that possible) — readers never block, queries hit tiny pre-aggregated tables.
- **`GROUPING SETS`** compute commune and IRIS levels × property types in one scan.
- **Import = DELETE + batched `INSERT … SELECT unnest($arrays)` per department-year in one transaction**: idempotent re-runs that also pick up DGFiP corrections/removals; 2 000 rows per round-trip.
- **Search uses GiST trigram indexes with KNN ordering (`<->>`) on `lower(f_unaccent(name))`**: the first version (GIN + CTE) took ~380 ms on 42 k near-identical names because it ranked every match; KNN stops after LIMIT rows (<1 ms). `f_unaccent` is an IMMUTABLE wrapper so it can be indexed.
- **Partial index `mv_area_stats (n DESC)`** for national-scale viewports: walk communes by size and stop at the LIMIT instead of sorting all 35 k.
- **Hand-written migration SQL** (Prisma-compatible format, applied by `prisma migrate deploy`): Prisma cannot express generated columns, expression/GiST indexes or materialized views. `--create-only` + edit is Prisma's documented path for this.

## Application
- **Next.js 16 App Router, route handlers as the API** (REST: `/api/map`, `/api/search`, `/api/areas/:level/:code`, `/api/streets/:key`, `/api/favorites`). REST over GraphQL: a handful of read-heavy, cacheable resources.
- **Prisma 7 (Rust-free client + `@prisma/adapter-pg`) for transactional models (favourites), raw `pg` for analytics SQL** — Prisma's query builder cannot express `percentile_cont`, KNN or `<@ box`; one shared pool for both.
- **Better Auth (email + password)** instead of hand-rolled auth: scrypt hashing, server-side sessions, rate limiting and origin checks are maintained upstream. Uses the shared pg pool; tables declared in the Prisma schema for FKs.
- **Favourites addressed by UUID and always filtered by `user_id` from the session**; foreign ids return 404 (no existence oracle). Mutations also require a same-origin `Origin` header (CSRF defence-in-depth on top of SameSite=Lax).
- **Public data responses are cacheable 5 min** (aggregates only change on import); private ones are `no-store`.
- **Geocoder = Géoplateforme (`data.geopf.fr/geocodage`)**, the official successor of `api-adresse.data.gouv.fr` (decommissioned January 2026), used for city search (typos, postcodes) with a 1.5 s timeout and graceful fallback to local search. Neighbourhood search is local (the geocoder has no IRIS).
- **Map = MapLibre GL + OpenFreeMap "dark" style**: free, no API key, no request limits, commercial use allowed, attribution required (MapLibre adds it). If the style fails to load the map falls back to a plain dark background so data stays usable.
- **MapLibre v6 worker served from `/public`**: its default worker URL is resolved relative to the bundled module and 404s under Turbopack.
- **Custom SVG trend chart** (no chart library): ~100 lines, gaps for low-sample years (never interpolated), and a real `<table>` for screen readers.
- **Accessibility**: the WebGL canvas is not navigable by keyboard or screen reader, so every visible street/commune is also listed as buttons ("Rues visibles"); search is a WAI-ARIA 1.2 combobox; animations are disabled under `prefers-reduced-motion`.
- **`noUncheckedIndexedAccess`** on top of `strict`: catches the off-by-one/undefined bugs typical of data code.

## Delivery
- **Docker multi-stage → Next.js standalone image (non-root, healthcheck)**, Postgres not published on the host, Nginx on the host terminates TLS (consistent with the existing VPS setup).
- **`tools` image target** runs migrations and the import inside the compose network: one command on the VPS, no Node toolchain on the host.
- **CI**: lint/types/unit → (migrations + synthetic import + idempotent re-import + integration + build + Playwright/axe) and Docker build in parallel.
- **No Claude attribution in commits; commits stay local** — pushing cadence is the owner's choice.
