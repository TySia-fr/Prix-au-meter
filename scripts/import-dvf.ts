/**
 * DVF import pipeline — one command, re-runnable (idempotent per department-year).
 *
 *   pnpm data:import --dept 34 --years 2021-2025
 *   pnpm data:import --dept 34 --source-dir data/fixtures/synthetic --source synthetic
 *
 * Steps: download (cached in data/raw) → Zod validation → cleaning (A3) →
 * IRIS assignment (point-in-polygon) → batched inserts → refresh materialized views.
 */
import "dotenv/config";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { getPool } from "@/server/pool";
import { IrisIndex } from "@/lib/geo/iris-index";
import { parseIrisGeoJson } from "@/lib/geo/iris-source";
import { loadSales, mergeRejections, readDvfFile, refreshAggregates, upsertIris, type Rejections } from "@/lib/dvf/pipeline";

const DVF_URL = "https://files.data.gouv.fr/geo-dvf/latest/csv/{year}/departements/{dept}.csv.gz";
const IRIS_URL =
  "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-france-iris/exports/geojson?refine=dep_code:{dept}";

const argsSchema = z.object({
  dept: z.string().regex(/^(\d{2,3}|2[AB])$/, "--dept must be a department code, e.g. 34"),
  years: z
    .string()
    .regex(/^\d{4}(-\d{4})?$/)
    .transform((s) => {
      const [a, b = a] = s.split("-").map(Number) as [number, number?];
      return Array.from({ length: b! - a + 1 }, (_, i) => a + i);
    }),
  source: z.enum(["dvf", "synthetic"]),
  sourceDir: z.string().optional(),
  irisFile: z.string().optional(),
  skipRefresh: z.boolean(),
});

async function download(url: string, dest: string) {
  try {
    await stat(dest);
    console.log(`  cached  ${dest}`);
    return;
  } catch {}
  console.log(`  fetch   ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) ${url}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const { values } = parseArgs({
    options: {
      dept: { type: "string", default: "34" },
      years: { type: "string", default: "2021-2025" },
      source: { type: "string", default: "dvf" },
      "source-dir": { type: "string" },
      "iris-file": { type: "string" },
      "skip-refresh": { type: "boolean", default: false },
    },
  });
  const args = argsSchema.parse({
    dept: values.dept,
    years: values.years,
    source: values.source,
    sourceDir: values["source-dir"],
    irisFile: values["iris-file"],
    skipRefresh: values["skip-refresh"],
  });
  const pool = getPool();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO import_run (source, department_code, years) VALUES ($1, $2, $3) RETURNING id`,
    [args.source, args.dept, args.years],
  );
  const runId = rows[0]!.id;
  const t0 = Date.now();
  let rejections: Rejections = {};
  let rowsRead = 0;
  let kept = 0;

  try {
    // 1. IRIS polygons (neighbourhoods)
    const irisPath =
      args.irisFile ?? (args.sourceDir ? path.join(args.sourceDir, `iris-${args.dept}.geojson`) : `data/raw/iris-${args.dept}.geojson`);
    if (!args.irisFile && !args.sourceDir) await download(IRIS_URL.replace("{dept}", args.dept), irisPath);
    const { features, invalid } = parseIrisGeoJson(JSON.parse(await readFile(irisPath, "utf8")));
    console.log(`IRIS: ${features.length} polygons (${invalid} invalid features skipped)`);
    if (features.length === 0) {
      // Without polygons every sale would lose its neighbourhood: stop instead of importing degraded data.
      throw new Error(`No valid IRIS polygon in ${irisPath}. Download the IRIS GeoJSON for department ${args.dept} manually and pass --iris-file <path>.`);
    }
    const index = new IrisIndex(features);

    // 2. Sales, one department-year file at a time (bounded memory, national scale)
    const communeNames = new Map<string, string>();
    for (const year of args.years) {
      const file = args.sourceDir
        ? path.join(args.sourceDir, String(year), `${args.dept}.csv.gz`)
        : `data/raw/${year}/${args.dept}.csv.gz`;
      if (!args.sourceDir) await download(DVF_URL.replace("{year}", String(year)).replace("{dept}", args.dept), file);
      const r = await readDvfFile(file);
      r.sales.forEach((s) => communeNames.set(s.communeCode, s.communeName));
      if (year === args.years[0]) await upsertIris(pool, features, communeNames);
      await loadSales(pool, args.dept, year, r.sales, index);
      rowsRead += r.rowsRead;
      kept += r.sales.length;
      rejections = mergeRejections(rejections, r.rejections);
      console.log(`${year}: ${r.rowsRead} rows → ${r.sales.length} sales kept`, r.rejections);
    }

    // 3. Aggregates
    if (!args.skipRefresh) {
      const t = Date.now();
      await refreshAggregates(pool);
      console.log(`Materialized views refreshed in ${Date.now() - t} ms`);
    }
    await pool.query(
      `UPDATE import_run SET status='done', rows_read=$2, mutations_kept=$3, rejections=$4, finished_at=now() WHERE id=$1`,
      [runId, rowsRead, kept, JSON.stringify(rejections)],
    );
    console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)} s — ${kept} sales from ${rowsRead} rows.`);
  } catch (e) {
    await pool.query(`UPDATE import_run SET status='failed', finished_at=now() WHERE id=$1`, [runId]);
    throw e;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
