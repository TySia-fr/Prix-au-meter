/**
 * Sequential colour scale for €/m² (viridis subset: perceptually uniform and
 * colour-blind safe, readable on a dark basemap). Low-sample areas are drawn
 * in neutral grey with no number.
 */
export const PRICE_BREAKS = [1500, 2500, 3500, 4500, 6000, 8000] as const;
export const PRICE_COLORS = ["#3b528b", "#2c728e", "#21918c", "#28ae80", "#5ec962", "#addc30", "#fde725"] as const;
export const LOW_SAMPLE_COLOR = "#6b7280";

export function colorFor(v: number | null): string {
  if (v == null) return LOW_SAMPLE_COLOR;
  const i = PRICE_BREAKS.findIndex((b) => v < b);
  return PRICE_COLORS[i === -1 ? PRICE_COLORS.length - 1 : i]!;
}

/** MapLibre "step" expression equivalent to colorFor(). */
export function colorExpression(): unknown[] {
  const steps: unknown[] = ["step", ["get", "median"], PRICE_COLORS[0]];
  PRICE_BREAKS.forEach((b, i) => steps.push(b, PRICE_COLORS[i + 1]));
  return ["case", ["==", ["get", "reliability"], "ok"], steps, LOW_SAMPLE_COLOR];
}

export function legendItems(): { color: string; label: string }[] {
  const fmt = (n: number) => n.toLocaleString("fr-FR");
  return PRICE_COLORS.map((color, i) => {
    const lo = PRICE_BREAKS[i - 1];
    const hi = PRICE_BREAKS[i];
    const label = lo == null ? `< ${fmt(hi!)} €` : hi == null ? `≥ ${fmt(lo)} €` : `${fmt(lo)} – ${fmt(hi)} €`;
    return { color, label };
  });
}
