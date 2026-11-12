import { NextResponse, type NextRequest } from "next/server";
import { searchSchema } from "@/lib/validation";
import { searchAreas, type AreaHit } from "@/server/queries";
import { geocodeCity } from "@/server/geocoder";
import { getPool } from "@/server/pool";
import { PUBLIC_CACHE, route } from "@/server/http";

/**
 * Search by city or neighbourhood (R2):
 *  - neighbourhoods (IRIS) and communes: local trigram + unaccent search
 *  - cities: also the official Géoplateforme geocoder (handles typos and postcodes),
 *    mapped back to the communes we have data for.
 */
export const GET = route(async (req: NextRequest) => {
  const { q } = searchSchema.parse({ q: req.nextUrl.searchParams.get("q") ?? "" });
  const [local, cities] = await Promise.all([searchAreas(q), geocodeCity(q)]);
  const seen = new Set(local.map((h) => `${h.level}:${h.code}`));
  const extraCodes = cities.map((c) => c.citycode).filter((c) => !seen.has(`commune:${c}`));
  let extra: AreaHit[] = [];
  if (extraCodes.length) {
    const { rows } = await getPool().query<{ code: string; name: string }>(
      `SELECT code, name FROM commune WHERE code = ANY($1::varchar[])`, [extraCodes]);
    extra = rows.map((r) => ({ level: "commune", code: r.code, name: r.name, communeName: null }));
  }
  return NextResponse.json({ results: [...extra, ...local].slice(0, 10) }, { headers: PUBLIC_CACHE });
});
