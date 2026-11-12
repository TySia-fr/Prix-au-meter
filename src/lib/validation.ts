import { z } from "zod";

/** Every external input (query strings, JSON bodies) is validated with these schemas on the server. */

export const areaLevelSchema = z.enum(["iris", "commune"]);
export type AreaLevel = z.infer<typeof areaLevelSchema>;

export const irisCodeSchema = z.string().regex(/^[0-9AB]{9}$/, "Code IRIS invalide");
export const communeCodeSchema = z.string().regex(/^(\d{5}|2[AB]\d{3})$/, "Code commune invalide");

export const areaRefSchema = z
  .object({ level: areaLevelSchema, code: z.string() })
  .superRefine((v, ctx) => {
    const ok = (v.level === "iris" ? irisCodeSchema : communeCodeSchema).safeParse(v.code).success;
    if (!ok) ctx.addIssue({ code: "custom", path: ["code"], message: "Code de zone invalide" });
  });
export type AreaRef = z.infer<typeof areaRefSchema>;

const lon = z.coerce.number().min(-180).max(180);
const lat = z.coerce.number().min(-90).max(90);

/** Map viewport. Streets are only served below a maximum span to bound payload size. */
export const bboxSchema = z
  .object({ minLon: lon, minLat: lat, maxLon: lon, maxLat: lat, layer: z.enum(["streets", "communes"]) })
  .refine((b) => b.minLon < b.maxLon && b.minLat < b.maxLat, "Emprise invalide")
  .refine((b) => b.layer === "communes" || (b.maxLon - b.minLon <= 0.6 && b.maxLat - b.minLat <= 0.4), "Emprise trop grande pour les rues");
export type Bbox = z.infer<typeof bboxSchema>;

export const searchSchema = z.object({ q: z.string().trim().min(2, "2 caractères minimum").max(80) });

export const streetKeySchema = z.string().regex(/^[0-9AB]{5}_[A-Z0-9]{1,10}$/);

export const favoriteBodySchema = z.object({ irisCode: irisCodeSchema });
