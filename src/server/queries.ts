import "server-only";
import { getPool } from "./pool";
import { SQL } from "./sql";

export { SQL };
import { applySampleThreshold, type PublicStat } from "@/lib/stats";
import type { AreaLevel, Bbox } from "@/lib/validation";


export const MAP_LIMIT = 4000;
const PROPERTY_TYPES = ["ALL", "HOUSE", "APARTMENT"] as const;
export type PropertyKey = (typeof PROPERTY_TYPES)[number];

interface StatRow { n: number; median: number | null; p25: number | null; p75: number | null }

export interface StreetFeature extends PublicStat { key: string; name: string; communeCode: string; lon: number; lat: number }
export interface CommuneFeature extends PublicStat { code: string; name: string; lon: number; lat: number }

export async function streetsInBbox(b: Bbox): Promise<StreetFeature[]> {
  const { rows } = await getPool().query<StatRow & { street_key: string; street_name: string; commune_code: string; lon: number; lat: number }>(
    SQL.streetsInBbox, [b.minLon, b.minLat, b.maxLon, b.maxLat, MAP_LIMIT],
  );
  return rows.map((r) => ({ key: r.street_key, name: r.street_name, communeCode: r.commune_code, lon: r.lon, lat: r.lat, ...applySampleThreshold(r) }));
}

export async function communesInBbox(b: Bbox): Promise<CommuneFeature[]> {
  const { rows } = await getPool().query<StatRow & { code: string; name: string; lon: number; lat: number }>(
    SQL.communesInBbox, [b.minLon, b.minLat, b.maxLon, b.maxLat, MAP_LIMIT],
  );
  return rows.map((r) => ({ code: r.code, name: r.name, lon: r.lon, lat: r.lat, ...applySampleThreshold(r) }));
}

export interface AreaHit { level: AreaLevel; code: string; name: string; communeName: string | null }

export async function searchAreas(q: string, limit = 8): Promise<AreaHit[]> {
  const { rows } = await getPool().query<{ level: AreaLevel; code: string; name: string; commune_name: string | null }>(SQL.searchAreas, [q, limit]);
  return rows.map((r) => ({ level: r.level, code: r.code, name: r.name, communeName: r.commune_name }));
}

export interface TrendPoint { year: number; byType: Record<PropertyKey, PublicStat> }

export async function trend(level: AreaLevel, code: string): Promise<TrendPoint[]> {
  const { rows } = await getPool().query<StatRow & { year: number; property_type: PropertyKey }>(SQL.trend, [level, code]);
  const byYear = new Map<number, TrendPoint>();
  const empty = () => applySampleThreshold({ n: 0, median: null });
  for (const r of rows) {
    let p = byYear.get(r.year);
    if (!p) byYear.set(r.year, (p = { year: r.year, byType: { ALL: empty(), HOUSE: empty(), APARTMENT: empty() } }));
    p.byType[r.property_type] = applySampleThreshold(r);
  }
  return [...byYear.values()];
}

export interface AreaDetail {
  level: AreaLevel;
  code: string;
  name: string;
  communeName: string | null;
  center: { lon: number; lat: number } | null;
  geometry: unknown | null;
  stats: Record<PropertyKey, PublicStat>;
}

export async function areaDetail(level: AreaLevel, code: string): Promise<AreaDetail | null> {
  const pool = getPool();
  const meta =
    level === "iris"
      ? await pool.query<{ name: string; commune_name: string; geometry: unknown }>(
          `SELECT i.name, c.name AS commune_name, i.geometry FROM iris i JOIN commune c ON c.code = i.commune_code WHERE i.code = $1`, [code])
      : await pool.query<{ name: string; commune_name: null; geometry: null }>(
          `SELECT name, NULL AS commune_name, NULL AS geometry FROM commune WHERE code = $1`, [code]);
  const m = meta.rows[0];
  if (!m) return null;
  const { rows } = await pool.query<StatRow & { property_type: PropertyKey; lon: number; lat: number }>(SQL.areaSummary, [level, code]);
  const stats = Object.fromEntries(PROPERTY_TYPES.map((t) => [t, applySampleThreshold({ n: 0, median: null })])) as Record<PropertyKey, PublicStat>;
  for (const r of rows) stats[r.property_type] = applySampleThreshold(r);
  const all = rows.find((r) => r.property_type === "ALL");
  return {
    level, code, name: m.name, communeName: m.commune_name, geometry: m.geometry,
    center: all ? { lon: all.lon, lat: all.lat } : null,
    stats,
  };
}

export interface StreetDetail extends StreetFeature { irisCode: string | null }

export async function streetDetail(key: string): Promise<StreetDetail | null> {
  const { rows } = await getPool().query<StatRow & { street_key: string; street_name: string; commune_code: string; iris_code: string | null; lon: number; lat: number }>(SQL.streetDetail, [key]);
  const r = rows[0];
  return r
    ? { key: r.street_key, name: r.street_name, communeCode: r.commune_code, irisCode: r.iris_code, lon: r.lon, lat: r.lat, ...applySampleThreshold(r) }
    : null;
}

export async function datasetInfo(): Promise<{ yearFrom: number; yearTo: number; source: "dvf" | "synthetic" | null }> {
  const pool = getPool();
  const [p, s] = await Promise.all([pool.query<{ year_from: number; year_to: number }>(SQL.period), pool.query<{ source: "dvf" | "synthetic" }>(SQL.dataSource)]);
  return { yearFrom: p.rows[0]?.year_from ?? 0, yearTo: p.rows[0]?.year_to ?? 0, source: s.rows[0]?.source ?? null };
}
