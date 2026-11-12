/**
 * Statistics helpers shared by the import pipeline (outlier fences) and the
 * API layer (sample-size thresholds). SQL computes medians with
 * percentile_cont; `quantile` uses the same linear interpolation so the two
 * agree (proven by tests/integration/aggregates.test.ts).
 */

/** Minimum number of sales behind any number we display (A4). */
export const MIN_SALES = 10;

/** Linear-interpolated quantile, identical to PostgreSQL percentile_cont. */
export function quantile(sortedAsc: readonly number[], q: number): number {
  if (sortedAsc.length === 0) throw new RangeError("quantile of empty sample");
  if (q < 0 || q > 1) throw new RangeError("q must be within [0, 1]");
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sortedAsc[lo]!;
  const b = sortedAsc[hi]!;
  return a + (b - a) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return quantile([...values].sort((x, y) => x - y), 0.5);
}

export type Reliability = "ok" | "low_sample";

export interface RawStat {
  n: number;
  median: number | null;
  p25?: number | null;
  p75?: number | null;
}

export interface PublicStat {
  n: number;
  reliability: Reliability;
  /** null whenever n < MIN_SALES — the number never leaves the server. */
  median: number | null;
  p25: number | null;
  p75: number | null;
}

/** Enforces A4: figures backed by fewer than MIN_SALES sales are withheld. */
export function applySampleThreshold(stat: RawStat, min = MIN_SALES): PublicStat {
  const ok = stat.n >= min && stat.median !== null;
  const round = (v: number | null | undefined) => (ok && v != null ? Math.round(v) : null);
  return {
    n: stat.n,
    reliability: ok ? "ok" : "low_sample",
    median: round(stat.median),
    p25: round(stat.p25),
    p75: round(stat.p75),
  };
}
