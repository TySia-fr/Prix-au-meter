/**
 * Query benchmark at national scale.
 *
 *   BENCH_DATABASE_URL=postgresql://pam:pam@localhost/pam_bench pnpm bench --sales 5000000
 *
 * Builds a throw-away database with N synthetic sales spread over ~35 000
 * communes (France has ~1 M house/apartment sales per year, so 5 M ≈ 5 years),
 * refreshes the materialized views, then runs EXPLAIN (ANALYZE, BUFFERS) on the
 * exact SQL the API uses (src/server/sql.ts). Writes docs/benchmarks.md.
 */
import "dotenv/config";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { SQL } from "../src/server/sql";

const TARGET_MS = 50;
const RUNS = 25;

const { values } = parseArgs({ options: { sales: { type: "string", default: "5000000" }, "skip-load": { type: "boolean", default: false } } });
const N = Number(values.sales);
const url = process.env.BENCH_DATABASE_URL;
if (!url) throw new Error("BENCH_DATABASE_URL is required (use a dedicated database: it is wiped)");
const pool = new Pool({ connectionString: url, max: 2 });

async function timed<T>(label: string, fn: () => Promise<T>) {
  const t = performance.now();
  const r = await fn();
  const ms = performance.now() - t;
  console.log(`${label}: ${(ms / 1000).toFixed(1)} s`);
  return { r, ms };
}

async function load() {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  for (const dir of (await readdir("prisma/migrations", { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    await pool.query(await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"));
  }
  await pool.query("SET maintenance_work_mem = '512MB'");
  // ~35 000 communes over metropolitan France; 1 in 12 is a city split into 8 IRIS.
  await pool.query(`
    INSERT INTO commune (code, name, department_code)
    SELECT lpad(((i % 95) + 1)::text, 2, '0') || lpad((i / 95)::text, 3, '0'),
           'Commune ' || i, lpad(((i % 95) + 1)::text, 2, '0')
    FROM generate_series(0, 34999) i`);
  await pool.query(`
    CREATE TEMP TABLE c AS
    SELECT code, row_number() OVER (ORDER BY code) AS rn,
           43 + random() * 7.5 AS lat, -1.5 + random() * 8.5 AS lon, (code ~ '[05]$') AND random() < 0.15 AS city,
           exp(7.6 + random() * 0.9) AS base
    FROM commune`);
  await pool.query(`
    INSERT INTO iris (code, name, commune_code, geometry)
    SELECT c.code || lpad(k::text, 4, '0'), 'Quartier ' || k || ' de ' || c.code, c.code, '{"type":"Polygon","coordinates":[]}'
    FROM c, generate_series(CASE WHEN c.city THEN 101 ELSE 0 END, CASE WHEN c.city THEN 108 ELSE 0 END) k`);
  const { ms } = await timed(`insert ${N.toLocaleString()} sales`, () =>
    pool.query(
      `INSERT INTO sale (department_code, mutation_id, date, year, commune_code, street_key, street_name, iris_code,
                         property_type, surface, rooms, value, price_per_m2, lat, lon)
       SELECT left(c.code, 2), g::text, make_date(y, 1 + (g % 12), 1 + (g % 28)), y, c.code,
              c.code || '_' || lpad(floor(random() * CASE WHEN c.city THEN 400 ELSE 25 END)::text, 4, '0'),
              'RUE SYNTHETIQUE',
              CASE WHEN c.city THEN c.code || lpad((101 + floor(random() * 8))::text, 4, '0') ELSE c.code || '0000' END,
              CASE WHEN random() < 0.35 THEN 'HOUSE' ELSE 'APARTMENT' END::"PropertyType",
              s, s / 22 + 1, round((p * s)::numeric, 2), p,
              c.lat + (random() - 0.5) * 0.04, c.lon + (random() - 0.5) * 0.05
       FROM generate_series(1, $1::int) g
       -- "+ g * 0" correlates the subquery so random() is evaluated per row, not once.
       CROSS JOIN LATERAL (SELECT 2021 + floor(random() * 5 + g * 0)::int AS y, 20 + floor(random() * 120 + g * 0)::int AS s) v
       JOIN c ON c.rn = 1 + (CASE WHEN g % 3 = 0 THEN g % 35000 ELSE (g::bigint * 7919) % 2000 END)
       CROSS JOIN LATERAL (SELECT (c.base * exp((random() - 0.5) * 0.6))::real AS p) pr`,
      [N],
    ),
  );
  console.log(`  ${Math.round(N / (ms / 1000)).toLocaleString()} rows/s`);
  const refresh = await timed("refresh materialized views", async () => {
    for (const mv of ["mv_street_stats", "mv_area_year_stats", "mv_area_stats"]) await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${mv}`);
    await pool.query("VACUUM ANALYZE");
  });
  return { insertMs: ms, refreshMs: refresh.ms };
}

interface Case { name: string; sql: string; params: () => Promise<unknown[]> }

async function pick(q: string) {
  return (await pool.query(q)).rows[0] as Record<string, unknown>;
}

const cases: Case[] = [
  {
    // Worst case allowed by the API: the largest street viewport (0.6° × 0.4°) centred on the densest commune.
    name: "Map — streets, largest allowed viewport on the densest area",
    sql: SQL.streetsInBbox,
    params: async () => {
      const r = await pick(`SELECT avg(geom[0]) AS lon, avg(geom[1]) AS lat FROM mv_street_stats
                            WHERE commune_code = (SELECT commune_code FROM mv_street_stats GROUP BY 1 ORDER BY count(*) DESC LIMIT 1)`);
      const lon = r.lon as number, lat = r.lat as number;
      return [lon - 0.3, lat - 0.2, lon + 0.3, lat + 0.2, 4000];
    },
  },
  { name: "Map — communes, whole metropolitan France (zoom 5)", sql: SQL.communesInBbox, params: async () => [-5.5, 41, 10, 51.5, 4000] },
  { name: "Search — fuzzy prefix matching ~42 k near-identical names (worst case)", sql: SQL.searchAreas, params: async () => ["quartier 104", 8] },
  { name: "Search — typo in a city name", sql: SQL.searchAreas, params: async () => ["comune 1234", 8] },
  {
    name: "Trend — yearly medians of one IRIS",
    sql: SQL.trend,
    params: async () => ["iris", (await pick(`SELECT code FROM mv_area_year_stats WHERE level='iris' GROUP BY code ORDER BY count(*) DESC, sum(n) DESC LIMIT 1`)).code],
  },
  {
    name: "Comparison — period summary of one IRIS (×2 per comparison)",
    sql: SQL.areaSummary,
    params: async () => ["iris", (await pick(`SELECT code FROM mv_area_stats WHERE level='iris' ORDER BY n DESC OFFSET 5 LIMIT 1`)).code],
  },
];

async function run() {
  const loadStats = values["skip-load"] ? null : await load();
  const { rows: [counts] } = await pool.query(
    `SELECT (SELECT count(*) FROM sale)::int AS sales, (SELECT count(*) FROM mv_street_stats)::int AS streets,
            (SELECT count(*) FROM iris)::int AS iris, (SELECT count(*) FROM commune)::int AS communes`);
  const results: { name: string; p50: number; p95: number; max: number; rows: number; plan: string }[] = [];
  for (const c of cases) {
    const params = await c.params();
    for (let i = 0; i < 3; i++) await pool.query(c.sql, params); // warm-up
    const times: number[] = [];
    let plan = "";
    let rows = 0;
    for (let i = 0; i < RUNS; i++) {
      const { rows: out } = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${c.sql}`, params);
      const text = out.map((r: Record<string, string>) => r["QUERY PLAN"]).join("\n");
      times.push(Number(/Execution Time: ([\d.]+) ms/.exec(text)![1]));
      if (i === RUNS - 1) {
        plan = text;
        rows = Number(/actual time=[\d.]+\.\.[\d.]+ rows=(\d+)/.exec(text)?.[1] ?? 0);
      }
    }
    times.sort((a, b) => a - b);
    const q = (p: number) => times[Math.min(times.length - 1, Math.floor(p * times.length))]!;
    results.push({ name: c.name, p50: q(0.5), p95: q(0.95), max: times.at(-1)!, rows, plan });
    console.log(`${c.name}: p50 ${q(0.5).toFixed(2)} ms · p95 ${q(0.95).toFixed(2)} ms`);
  }
  const { rows: [pg] } = await pool.query("SHOW server_version");
  const table = [
    `| Query | p50 | p95 | max | rows | ≤ ${TARGET_MS} ms |`,
    "|---|---:|---:|---:|---:|:-:|",
    ...results.map((r) => `| ${r.name} | ${r.p50.toFixed(2)} ms | ${r.p95.toFixed(2)} ms | ${r.max.toFixed(2)} ms | ${r.rows} | ${r.p95 <= TARGET_MS ? "✅" : "❌"} |`),
  ].join("\n");
  const md = `# Query benchmarks

Generated by \`pnpm bench\` on ${new Date().toISOString().slice(0, 10)} — PostgreSQL ${pg.server_version}, ${RUNS} runs per query after 3 warm-up runs.
Times are PostgreSQL **execution time** from \`EXPLAIN (ANALYZE, BUFFERS)\` (server-side, excludes network/JSON).

**Dataset:** ${counts.sales.toLocaleString("en")} sales · ${counts.streets.toLocaleString("en")} streets · ${counts.iris.toLocaleString("en")} IRIS · ${counts.communes.toLocaleString("en")} communes (synthetic, national scale).
${loadStats ? `**Load:** batched insert ${(loadStats.insertMs / 1000).toFixed(1)} s · materialized view refresh + VACUUM ANALYZE ${(loadStats.refreshMs / 1000).toFixed(1)} s.\n` : ""}
**Hardware:** ${(await import("node:os")).cpus().length} vCPU / ${Math.round((await import("node:os")).totalmem() / 2 ** 30)} GB, default PostgreSQL configuration.

**Target:** p95 ≤ ${TARGET_MS} ms for every key query.

${table}

## Plans (last run)

${results.map((r) => `### ${r.name}\n\n\`\`\`\n${r.plan}\n\`\`\``).join("\n\n")}
`;
  await writeFile("docs/benchmarks.md", md);
  console.log("\n" + table + "\n\nwritten to docs/benchmarks.md");
  await pool.end();
  if (results.some((r) => r.p95 > TARGET_MS)) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
