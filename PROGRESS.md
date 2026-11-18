# Progress

_Last update: 2026-11-18_

## State
All features R1–R5 work end-to-end on synthetic DVF-shaped data. Local verification (last run):

| Check | Result |
|---|---|
| `pnpm lint` | ✅ 0 warnings |
| `pnpm typecheck` | ✅ |
| `pnpm test` (unit) | ✅ 28/28 |
| `pnpm test:integration` | ✅ 5/5 |
| `pnpm build` | ✅ |
| `pnpm test:e2e` (Playwright + axe) | ✅ 4/4 |
| `pnpm bench` (5 M sales) | ✅ all key queries p95 ≤ 50 ms |

Not verifiable from the build sandbox (network allowlist): real DVF download, `prisma migrate deploy` (Prisma schema-engine binary download), `docker build` (no registry). All three run in CI / on the VPS.

## Live
https://prixaumeter.siavashizadi.com — real DVF data for Hérault (2021–2025): 104 883 sales, 578 IRIS. Montpellier median 3 476 €/m² (n = 12 733).

## Resume here
1. Retake README screenshots on real data with the basemap.
2. Optional: import more departments (`docker compose run --rm tools pnpm data:import --dept 30`), re-run the benchmark on real data.

## Log
- 2026-11-12 — scaffold, schema + MVs, import pipeline, synthetic generator, API, UI, unit tests.
- 2026-11-13 — Playwright + axe, access-control proof, benchmarks (found and fixed 2 slow queries), Docker/compose/Nginx, CI, docs.
- 2026-11-18 — subdomain prixaumeter, app on 127.0.0.1:3107, real import on the VPS, live with HTTPS.
