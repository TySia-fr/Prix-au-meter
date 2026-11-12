import { quantile } from "@/lib/stats";
import type { RawDvfRow } from "./raw-row";

/**
 * Cleaning rules (A3) — documented in README "Data cleaning rules".
 *
 * DVF publishes one CSV line per (mutation × local × parcel/culture), and the
 * sale value is the total of the whole mutation, repeated on every line. A
 * price per m² is therefore only meaningful when a mutation contains exactly
 * one dwelling. Rules, applied per mutation:
 *
 *  R-NATURE   nature_mutation ∈ {Vente, Vente en l'état futur d'achèvement}
 *  R-DWELLING exactly one distinct house/apartment (outbuildings "Dépendance" allowed)
 *  R-MIXED    no commercial/industrial premises in the same mutation
 *  R-VALUE    valeur_fonciere present and > 0
 *  R-SURFACE  9 m² ≤ built surface ≤ 1000 m² (9 m² = legal minimum dwelling)
 *  R-COORDS   coordinates present and inside metropolitan France / DROM bounds
 *  R-BOUNDS   200 €/m² ≤ price ≤ 30 000 €/m² (removes symbolic and aberrant sales)
 *  R-FENCE    per (department, property type, year) with ≥ 30 sales: drop prices
 *             outside log-IQR fences [Q1 − 1.5·IQR, Q3 + 1.5·IQR] on ln(price)
 */

export const ACCEPTED_NATURES = new Set(["Vente", "Vente en l'état futur d'achèvement"]);
export const SURFACE_MIN = 9;
export const SURFACE_MAX = 1000;
export const PRICE_MIN = 200;
export const PRICE_MAX = 30_000;
export const FENCE_MIN_GROUP = 30;
export const FENCE_K = 1.5;

export type PropertyType = "HOUSE" | "APARTMENT";

export type RejectReason =
  | "nature"
  | "no_dwelling"
  | "multiple_dwellings"
  | "mixed_use"
  | "value"
  | "surface"
  | "coords"
  | "price_bounds"
  | "price_fence";

export interface CleanSale {
  departmentCode: string;
  mutationId: string;
  date: string;
  year: number;
  communeCode: string;
  communeName: string;
  streetKey: string;
  streetName: string;
  propertyType: PropertyType;
  surface: number;
  rooms: number | null;
  value: number;
  pricePerM2: number;
  lat: number;
  lon: number;
}

export type CleanResult = { ok: true; sale: CleanSale } | { ok: false; reason: RejectReason };

const DWELLING_TYPES: Record<string, PropertyType> = { Maison: "HOUSE", Appartement: "APARTMENT" };

function inFranceBounds(lat: number, lon: number): boolean {
  const metro = lat >= 41 && lat <= 51.5 && lon >= -5.5 && lon <= 10;
  const drom = lat >= -21.5 && lat <= 16.6 && lon >= -63 && lon <= 56; // Antilles, Guyane, Réunion, Mayotte
  return metro || drom;
}

/** Rule-based cleaning of one mutation (all its CSV lines). */
export function cleanMutation(rows: readonly RawDvfRow[]): CleanResult {
  const first = rows[0];
  if (!first) return { ok: false, reason: "no_dwelling" };
  if (!ACCEPTED_NATURES.has(first.nature_mutation)) return { ok: false, reason: "nature" };

  const dwellings = new Map<string, RawDvfRow>();
  for (const r of rows) {
    if (r.type_local === "Local industriel. commercial ou assimilé") return { ok: false, reason: "mixed_use" };
    if (r.type_local && r.type_local in DWELLING_TYPES) {
      // The same dwelling is repeated once per parcel culture line: dedupe it.
      const key = [r.id_parcelle, r.type_local, r.lot1_numero, r.surface_reelle_bati, r.nombre_pieces_principales].join("|");
      dwellings.set(key, r);
    }
  }
  if (dwellings.size === 0) return { ok: false, reason: "no_dwelling" };
  if (dwellings.size > 1) return { ok: false, reason: "multiple_dwellings" };
  const d = [...dwellings.values()][0]!;

  const value = first.valeur_fonciere;
  if (value == null || value <= 0) return { ok: false, reason: "value" };

  const surface = d.surface_reelle_bati;
  if (surface == null || surface < SURFACE_MIN || surface > SURFACE_MAX) return { ok: false, reason: "surface" };

  const { latitude: lat, longitude: lon } = d;
  if (lat == null || lon == null || !inFranceBounds(lat, lon)) return { ok: false, reason: "coords" };

  const pricePerM2 = value / surface;
  if (pricePerM2 < PRICE_MIN || pricePerM2 > PRICE_MAX) return { ok: false, reason: "price_bounds" };

  const streetCode = d.adresse_code_voie ?? "XXXX";
  return {
    ok: true,
    sale: {
      departmentCode: first.code_departement,
      mutationId: first.id_mutation,
      date: first.date_mutation,
      year: Number(first.date_mutation.slice(0, 4)),
      communeCode: d.code_commune,
      communeName: d.nom_commune,
      streetKey: `${d.code_commune}_${streetCode}`.slice(0, 16),
      streetName: (d.adresse_nom_voie ?? "Voie non renseignée").slice(0, 160),
      propertyType: DWELLING_TYPES[d.type_local!]!,
      surface: Math.round(surface),
      rooms: d.nombre_pieces_principales == null ? null : Math.round(d.nombre_pieces_principales),
      value,
      pricePerM2,
      lat,
      lon,
    },
  };
}

export interface Fence {
  lo: number;
  hi: number;
}

/** Log-IQR fence for a group of prices; null when the group is too small. */
export function computeFence(prices: readonly number[], k = FENCE_K, minGroup = FENCE_MIN_GROUP): Fence | null {
  if (prices.length < minGroup) return null;
  const logs = prices.map(Math.log).sort((a, b) => a - b);
  const q1 = quantile(logs, 0.25);
  const q3 = quantile(logs, 0.75);
  const iqr = q3 - q1;
  return { lo: Math.exp(q1 - k * iqr), hi: Math.exp(q3 + k * iqr) };
}

/** Applies R-FENCE per (department, property type, year). */
export function applyFences(sales: readonly CleanSale[]): { kept: CleanSale[]; rejected: number } {
  const groups = new Map<string, CleanSale[]>();
  for (const s of sales) {
    const key = `${s.departmentCode}|${s.propertyType}|${s.year}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(s);
  }
  const kept: CleanSale[] = [];
  let rejected = 0;
  for (const group of groups.values()) {
    const fence = computeFence(group.map((s) => s.pricePerM2));
    for (const s of group) {
      if (fence && (s.pricePerM2 < fence.lo || s.pricePerM2 > fence.hi)) rejected++;
      else kept.push(s);
    }
  }
  return { kept, rejected };
}
