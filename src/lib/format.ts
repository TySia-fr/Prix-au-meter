const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("fr-FR");

export const formatPricePerM2 = (v: number | null) => (v == null ? "—" : `${eur.format(v)}/m²`);
export const formatInt = (v: number) => int.format(v);
export const formatPct = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
/** DVF street names are upper-case: "RUE DE LA LOGE" → "Rue de la Loge". */
export function titleCaseStreet(name: string): string {
  const small = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et", "au", "aux", "sur", "en"]);
  return name
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}
