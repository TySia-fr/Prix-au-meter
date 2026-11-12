import { z } from "zod";

/**
 * One line of the Etalab "DVF géolocalisées" CSV (geo-dvf). Only the columns
 * we use are declared; everything else is stripped. Empty strings become null.
 * Schema reference: https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/
 */
const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const optNumber = z.preprocess(emptyToNull, z.coerce.number().finite().nullable());
const optString = z.preprocess(emptyToNull, z.string().trim().nullable());

export const rawDvfRowSchema = z.object({
  id_mutation: z.string().min(1).max(32),
  date_mutation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nature_mutation: z.string().min(1),
  valeur_fonciere: optNumber,
  adresse_nom_voie: optString,
  adresse_code_voie: optString,
  code_commune: z.string().regex(/^(\d{5}|2[AB]\d{3})$/),
  nom_commune: z.string().min(1),
  code_departement: z.string().regex(/^(\d{2,3}|2[AB])$/),
  id_parcelle: optString,
  lot1_numero: optString,
  type_local: optString,
  surface_reelle_bati: optNumber,
  nombre_pieces_principales: optNumber,
  longitude: optNumber,
  latitude: optNumber,
});

export type RawDvfRow = z.infer<typeof rawDvfRowSchema>;
