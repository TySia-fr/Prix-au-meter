import Flatbush from "flatbush";

/** Minimal GeoJSON types — we only need (Multi)Polygons in WGS84. */
type Ring = [number, number][];
export type PolygonCoords = Ring[];
export type IrisGeometry =
  | { type: "Polygon"; coordinates: PolygonCoords }
  | { type: "MultiPolygon"; coordinates: PolygonCoords[] };

export interface IrisFeature {
  code: string;
  name: string;
  communeCode: string;
  geometry: IrisGeometry;
}

/** Ray-casting point-in-ring test (even-odd rule). */
function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, y: number, poly: PolygonCoords): boolean {
  const [outer, ...holes] = poly;
  if (!outer || !inRing(x, y, outer)) return false;
  return !holes.some((h) => inRing(x, y, h));
}

export function pointInGeometry(lon: number, lat: number, g: IrisGeometry): boolean {
  return g.type === "Polygon"
    ? inPolygon(lon, lat, g.coordinates)
    : g.coordinates.some((p) => inPolygon(lon, lat, p));
}

function bbox(g: IrisGeometry): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const p of polys)
    for (const [x, y] of p[0] ?? []) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return [minX, minY, maxX, maxY];
}

/**
 * Spatial index over IRIS polygons: an R-tree (Flatbush) on bounding boxes,
 * then an exact point-in-polygon test on candidates. Lets the importer assign
 * an IRIS to every sale without PostGIS.
 */
export class IrisIndex {
  private readonly index: Flatbush | null;

  constructor(private readonly features: readonly IrisFeature[]) {
    if (features.length === 0) {
      this.index = null;
      return;
    }
    const idx = new Flatbush(features.length);
    for (const f of features) idx.add(...bbox(f.geometry));
    idx.finish();
    this.index = idx;
  }

  /** IRIS code containing the point, preferring the sale's own commune. */
  lookup(lon: number, lat: number, communeCode?: string): string | null {
    if (!this.index) return null;
    const hits = this.index
      .search(lon, lat, lon, lat)
      .map((i) => this.features[i]!)
      .filter((f) => pointInGeometry(lon, lat, f.geometry));
    const same = hits.find((f) => f.communeCode === communeCode);
    return (same ?? hits[0])?.code ?? null;
  }
}
