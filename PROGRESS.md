# Progress

_Last update: 2026-11-13_

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

## Resume here
1. Owner actions below.
2. After the first real import: check `SELECT rejections FROM import_run ORDER BY id DESC LIMIT 1` — rejection shares should look like: multiple_dwellings and no_dwelling dominant, price_fence ≲ 3 %.
3. Retake README screenshots on real data with the basemap (`pnpm screenshots` against the running app).

## Owner actions
1. **Real data**: `pnpm data:import --dept 34` on a machine with internet (laptop or VPS).
2. **GitHub**: create `TySia-fr/prix-au-metre`, push, check that the 3 CI jobs pass.
3. **VPS**: DNS `prixaumeter.siavashizadi.com` → TySia, Docker installed, follow README → Deployment.

## Log
- 2026-11-12 — scaffold, schema + MVs, import pipeline, synthetic generator, API, UI, unit tests.
- 2026-11-13 — Playwright + axe, access-control proof, benchmarks (found and fixed 2 slow queries), Docker/compose/Nginx, CI, docs.
