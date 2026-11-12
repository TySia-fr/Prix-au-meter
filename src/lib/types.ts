import type { PublicStat } from "./stats";
import type { AreaLevel } from "./validation";

export type PropertyKey = "ALL" | "HOUSE" | "APARTMENT";
export interface TrendPoint { year: number; byType: Record<PropertyKey, PublicStat> }
export interface AreaPayload {
  level: AreaLevel;
  code: string;
  name: string;
  communeName: string | null;
  center: { lon: number; lat: number } | null;
  geometry: GeoJSON.Geometry | null;
  stats: Record<PropertyKey, PublicStat>;
  trend: TrendPoint[];
}
export interface StreetPayload extends PublicStat {
  key: string;
  name: string;
  communeCode: string;
  irisCode: string | null;
  lon: number;
  lat: number;
}
export interface SearchHit { level: AreaLevel; code: string; name: string; communeName: string | null }

export const PROPERTY_LABELS: Record<PropertyKey, string> = { ALL: "Tous logements", HOUSE: "Maisons", APARTMENT: "Appartements" };
