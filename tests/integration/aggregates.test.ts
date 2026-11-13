import { afterAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { Pool } from "pg";
import { median, MIN_SALES } from "@/lib/stats";

/**
 * Runs against a database loaded with `pnpm db:seed:synthetic`.
 * Proves that the SQL aggregates (percentile_cont in materialized views)
 * equal the TypeScript reference implementation on the same rows.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());

describe("materialized views vs. reference implementation", () => {
  it("commune-year medians match a recomputation from raw sales", async () => {
    const { rows: mv } = await pool.query<{ code: string; year: number; n: number; median: number }>(
      `SELECT code, year, n, median FROM mv_area_year_stats WHERE level = 'commune' AND property_type = 'ALL' ORDER BY n DESC LIMIT 5`);
    expect(mv.length).toBeGreaterThan(0);
    for (const r of mv) {
      const { rows } = await pool.query<{ p: number }>(`SELECT price_per_m2 AS p FROM sale WHERE commune_code = $1 AND year = $2`, [r.code, r.year]);
      expect(rows).toHaveLength(r.n);
      expect(r.median).toBeCloseTo(median(rows.map((x) => x.p)), 0);
    }
  });

  it("street medians cover only the reference period (last 3 years)", async () => {
    const { rows: [p] } = await pool.query<{ year_from: number; year_to: number }>(`SELECT * FROM v_period`);
    const { rows: [s] } = await pool.query<{ street_key: string; n: number; median: number }>(
      `SELECT street_key, n, median FROM mv_street_stats ORDER BY n DESC LIMIT 1`);
    const { rows } = await pool.query<{ p: number }>(
      `SELECT price_per_m2 AS p FROM sale WHERE street_key = $1 AND year BETWEEN $2 AND $3`, [s!.street_key, p!.year_from, p!.year_to]);
    expect(rows).toHaveLength(s!.n);
    expect(s!.median).toBeCloseTo(median(rows.map((x) => x.p)), 0);
  });

  it("contains low-sample streets, which the API layer must hide", async () => {
    const { rows: [r] } = await pool.query<{ low: number }>(`SELECT count(*)::int AS low FROM mv_street_stats WHERE n < $1`, [MIN_SALES]);
    expect(r!.low).toBeGreaterThan(0);
  });

  it("assigns an IRIS to (almost) every sale", async () => {
    const { rows: [r] } = await pool.query<{ share: number }>(`SELECT avg((iris_code IS NOT NULL)::int)::float AS share FROM sale`);
    expect(r!.share).toBeGreaterThan(0.99);
  });

  it("import is idempotent: re-importing a year does not duplicate sales", async () => {
    const { rows: [r] } = await pool.query<{ dup: number }>(
      `SELECT count(*)::int AS dup FROM (SELECT department_code, mutation_id FROM sale GROUP BY 1, 2 HAVING count(*) > 1) d`);
    expect(r!.dup).toBe(0);
  });
});
