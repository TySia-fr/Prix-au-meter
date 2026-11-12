import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { parse } from "csv-parse";
import type { Pool, PoolClient } from "pg";
import { applyFences, cleanMutation, type CleanSale, type RejectReason } from "./clean";
import { rawDvfRowSchema, type RawDvfRow } from "./raw-row";
import type { IrisFeature } from "@/lib/geo/iris-index";
import { IrisIndex } from "@/lib/geo/iris-index";

export const BATCH_SIZE = 2000;

export type Rejections = Partial<Record<RejectReason | "invalid_row", number>>;

export interface FileResult {
  rowsRead: number;
  sales: CleanSale[];
  rejections: Rejections;
}

/** Streams one geo-dvf CSV(.gz), validates rows with Zod and cleans mutations. */
export async function readDvfFile(path: string): Promise<FileResult> {
  const input = createReadStream(path);
  const source = path.endsWith(".gz") ? input.pipe(createGunzip()) : input;
  const parser = source.pipe(parse({ columns: true, skip_empty_lines: true, relax_column_count: true }));

  const byMutation = new Map<string, RawDvfRow[]>();
  const rejections: Rejections = {};
  let rowsRead = 0;
  for await (const record of parser) {
    rowsRead++;
    const parsed = rawDvfRowSchema.safeParse(record);
    if (!parsed.success) {
      rejections.invalid_row = (rejections.invalid_row ?? 0) + 1;
      continue;
    }
    const id = parsed.data.id_mutation;
    const list = byMutation.get(id);
    if (list) list.push(parsed.data);
    else byMutation.set(id, [parsed.data]);
  }

  const sales: CleanSale[] = [];
  for (const rows of byMutation.values()) {
    const r = cleanMutation(rows);
    if (r.ok) sales.push(r.sale);
    else rejections[r.reason] = (rejections[r.reason] ?? 0) + 1;
  }
  const { kept, rejected } = applyFences(sales);
  if (rejected) rejections.price_fence = rejected;
  return { rowsRead, sales: kept, rejections };
}

async function upsertCommunes(client: PoolClient, sales: readonly CleanSale[]) {
  const communes = new Map<string, { name: string; dept: string }>();
  for (const s of sales) communes.set(s.communeCode, { name: s.communeName, dept: s.departmentCode });
  const codes = [...communes.keys()];
  await client.query(
    `INSERT INTO commune (code, name, department_code)
     SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::varchar[])
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
    [codes, codes.map((c) => communes.get(c)!.name), codes.map((c) => communes.get(c)!.dept)],
  );
}

export async function upsertIris(pool: Pool, features: readonly IrisFeature[], communeNames: Map<string, string>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < features.length; i += 500) {
      const chunk = features.slice(i, i + 500);
      // IRIS can exist in communes without retained sales: create the commune row too.
      const cc = [...new Set(chunk.map((f) => f.communeCode))];
      await client.query(
        `INSERT INTO commune (code, name, department_code)
         SELECT c, COALESCE(n, c), CASE WHEN c LIKE '97%' THEN left(c, 3) ELSE left(c, 2) END
         FROM unnest($1::varchar[], $2::varchar[]) AS t(c, n)
         ON CONFLICT (code) DO NOTHING`,
        [cc, cc.map((c) => communeNames.get(c) ?? null)],
      );
      await client.query(
        `INSERT INTO iris (code, name, commune_code, geometry)
         SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::jsonb[])
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, commune_code = EXCLUDED.commune_code, geometry = EXCLUDED.geometry`,
        [chunk.map((f) => f.code), chunk.map((f) => f.name), chunk.map((f) => f.communeCode), chunk.map((f) => JSON.stringify(f.geometry))],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Replaces all sales of (department, year) atomically: DELETE then batched
 * multi-row INSERTs (one round-trip per BATCH_SIZE rows via unnest arrays).
 * Re-running the import is therefore idempotent and picks up DGFiP corrections.
 */
export async function loadSales(pool: Pool, dept: string, year: number, sales: readonly CleanSale[], iris: IrisIndex) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await upsertCommunes(client, sales);
    await client.query("DELETE FROM sale WHERE department_code = $1 AND year = $2", [dept, year]);
    for (let i = 0; i < sales.length; i += BATCH_SIZE) {
      const b = sales.slice(i, i + BATCH_SIZE);
      await client.query(
        `INSERT INTO sale (department_code, mutation_id, date, year, commune_code, street_key, street_name,
                           iris_code, property_type, surface, rooms, value, price_per_m2, lat, lon)
         SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::date[], $4::smallint[], $5::varchar[], $6::varchar[],
                              $7::varchar[], $8::varchar[], $9::"PropertyType"[], $10::smallint[], $11::smallint[],
                              $12::numeric[], $13::real[], $14::float8[], $15::float8[])
         ON CONFLICT (department_code, mutation_id) DO NOTHING`,
        [
          b.map((s) => s.departmentCode), b.map((s) => s.mutationId), b.map((s) => s.date), b.map((s) => s.year),
          b.map((s) => s.communeCode), b.map((s) => s.streetKey), b.map((s) => s.streetName),
          b.map((s) => iris.lookup(s.lon, s.lat, s.communeCode)), b.map((s) => s.propertyType),
          b.map((s) => s.surface), b.map((s) => s.rooms), b.map((s) => s.value), b.map((s) => s.pricePerM2),
          b.map((s) => s.lat), b.map((s) => s.lon),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Refreshes aggregates without blocking readers (needs the unique indexes). */
export async function refreshAggregates(pool: Pool) {
  for (const mv of ["mv_street_stats", "mv_area_year_stats", "mv_area_stats"]) {
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${mv}`);
  }
  await pool.query("ANALYZE sale");
}

export function mergeRejections(a: Rejections, b: Rejections): Rejections {
  const out: Rejections = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof Rejections, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}
