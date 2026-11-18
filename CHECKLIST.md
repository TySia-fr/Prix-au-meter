# Checklist (R1–R9)

Evidence = test, command output or file. ⏳ = needs something only the owner can do (see PROGRESS.md → "Owner actions").

## R1 — Interactive map, price per m² street by street
- [x] MapLibre map, street circles coloured by median €/m², sized by √n — `src/components/price-map.tsx`
- [x] Colour scale + legend (viridis, colour-blind safe) — `src/lib/colors.ts`, legend in `src/components/explorer.tsx`
- [x] Hover tooltip + click details (street panel) — e2e `journey.spec.ts` (street panel opens)
- [x] Commune layer below zoom 13 — `/api/map?layer=communes`
- [x] Keyboard/screen-reader alternative: "Rues visibles" list — e2e clicks it
- [x] Tile licence verified (OpenFreeMap, free, attribution) — DECISIONS.md

## R2 — Search by city or neighbourhood
- [x] WAI-ARIA combobox — `src/components/search-box.tsx`, e2e keyboard selection
- [x] IRIS + commune trigram/unaccent search, KNN index — `src/server/sql.ts`, benchmark ≤ 15 ms p95
- [x] Official geocoder (Géoplateforme) verified and integrated with timeout/fallback — `src/server/geocoder.ts`

## R3 — Price trend chart
- [x] Yearly medians ALL/houses/apartments, gaps for low-sample years, data table — `src/components/trend-chart.tsx`, e2e asserts table contains 2025

## R4 — Compare two neighbourhoods
- [x] `/comparer?a=&b=`: medians, n, IQR, % gap, overlaid trend — `src/components/compare-view.tsx`, e2e asserts the % sentence

## R5 — Favourites
- [x] Accounts (Better Auth) — `src/server/auth.ts`
- [x] Favourites API scoped to session user, 404 on foreign ids, CSRF origin check — `src/server/favorites.ts`
- [x] Proof: `tests/e2e/access-control.spec.ts` (Bob can neither list nor delete Alice's favourite)

## R6 — Real DVF data
- [x] Source + licence verified (geo-dvf, Licence Ouverte 2.0, no re-identification, no indexing) — README, DECISIONS
- [x] One-command import with download + cache — `pnpm data:import --dept 34`
- [x] Real Hérault import 2021–2025 on the VPS: 412 496 rows → 104 883 sales, 578 IRIS, 76 s (2026-11-18)

## R7 — PostgreSQL at scale
- [x] Indexes (GiST point, GiST trigram, partial btree), MVs with GROUPING SETS, CONCURRENT refresh — `prisma/migrations/0001_init/migration.sql`
- [x] Batched inserts, idempotent per dept-year — `src/lib/dvf/pipeline.ts`, CI re-import step, integration test
- [x] EXPLAIN ANALYZE benchmark at 5 M sales, all key queries p95 ≤ 50 ms — `docs/benchmarks.md`, README

## R8 — Dark design + animations
- [x] Dark token-based theme (Tailwind v4 `@theme`) — `src/app/globals.css`
- [x] Subtle fade/slide/line-draw animations, all disabled under `prefers-reduced-motion` — globals.css, map uses jumpTo
- [ ] ⏳ Visual alignment with the portfolio palette (owner to confirm accent colour)

## R9 — Stack demonstration
- [x] Next.js 16 App Router, React 19, Tailwind 4, TS strict + noUncheckedIndexedAccess
- [x] Accessibility: axe (WCAG 2.1 AA) 0 violations on 4 pages — e2e
- [x] PostgreSQL + Prisma 7 + raw SQL, Zod on every input
- [x] Vitest unit (28) + integration (5), Playwright e2e (4)
- [x] Dockerfile (multi-stage, non-root, healthcheck), compose, Nginx config — not built in sandbox (no registry access); built by CI job `docker`
- [x] GitHub Actions CI — `.github/workflows/ci.yml`
- [x] CI green on GitHub (lint · types · unit → migrations · import · integration · build · e2e → GHCR images)
- [x] Live: https://prixaumeter.siavashizadi.com (Docker on the VPS, images pulled from GHCR, Nginx + Let's Encrypt)
