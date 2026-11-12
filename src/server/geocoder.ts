import "server-only";
import { z } from "zod";

/**
 * Géoplateforme geocoding API (IGN) — the official successor of
 * api-adresse.data.gouv.fr (decommissioned January 2026). No key required.
 * Docs: https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage
 */
const responseSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.object({ citycode: z.string(), city: z.string().optional(), name: z.string(), postcode: z.string().optional() }),
    }),
  ),
});

export interface GeocodedCity { citycode: string; name: string; postcode?: string; lon: number; lat: number }

export async function geocodeCity(q: string, timeoutMs = 1500): Promise<GeocodedCity[]> {
  const base = process.env.GEOCODER_URL ?? "https://data.geopf.fr/geocodage";
  const url = `${base}/search?${new URLSearchParams({ q, type: "municipality", limit: "5", autocomplete: "1" })}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const parsed = responseSchema.safeParse(await res.json());
    if (!parsed.success) return [];
    return parsed.data.features.map((f) => ({
      citycode: f.properties.citycode,
      name: f.properties.city ?? f.properties.name,
      postcode: f.properties.postcode,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
  } catch {
    // Degrade gracefully: local search still works if the geocoder is down.
    return [];
  }
}
