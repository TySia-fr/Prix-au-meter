import { z } from "zod";
import type { IrisFeature, IrisGeometry } from "./iris-index";

/**
 * Normalises IRIS GeoJSON from either the IGN/INSEE "Contours…IRIS" export
 * (CODE_IRIS / NOM_IRIS / INSEE_COM) or the Opendatasoft "georef-france-iris"
 * export (iris_code / iris_name / com_code, sometimes wrapped in arrays).
 */
const unwrap = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const pick = (p: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (p[k] != null && p[k] !== "") return unwrap(p[k]);
  return undefined;
};

const geometrySchema = z.union([
  z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.tuple([z.number(), z.number()]).rest(z.number()))) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()]).rest(z.number())))) }),
]);

const featureSchema = z.object({
  properties: z.record(z.string(), z.unknown()),
  geometry: geometrySchema,
});

const normalized = z.object({
  code: z.string().regex(/^[0-9AB]{9}$/),
  name: z.string().min(1).max(160),
  communeCode: z.string().regex(/^(\d{5}|2[AB]\d{3})$/),
});

export function parseIrisGeoJson(json: unknown): { features: IrisFeature[]; invalid: number } {
  const fc = z.object({ features: z.array(z.unknown()) }).parse(json);
  const features: IrisFeature[] = [];
  let invalid = 0;
  for (const raw of fc.features) {
    const f = featureSchema.safeParse(raw);
    if (!f.success) { invalid++; continue; }
    const p = f.data.properties;
    const n = normalized.safeParse({
      code: String(pick(p, ["iris_code", "code_iris", "CODE_IRIS", "DCOMIRIS"]) ?? ""),
      name: String(pick(p, ["iris_name", "nom_iris", "NOM_IRIS"]) ?? ""),
      communeCode: String(pick(p, ["com_code", "insee_com", "INSEE_COM", "DEPCOM"]) ?? ""),
    });
    if (!n.success) { invalid++; continue; }
    features.push({ ...n.data, geometry: f.data.geometry as IrisGeometry });
  }
  return { features, invalid };
}
