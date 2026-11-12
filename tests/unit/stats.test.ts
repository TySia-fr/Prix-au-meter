import { describe, expect, it } from "vitest";
import { applySampleThreshold, median, MIN_SALES, quantile } from "@/lib/stats";

describe("quantile / median", () => {
  it("matches PostgreSQL percentile_cont interpolation", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(quantile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(quantile([1, 2], 0.75)).toBe(1.75);
  });
  it("rejects empty samples and invalid q", () => {
    expect(() => median([])).toThrow(RangeError);
    expect(() => quantile([1], 1.5)).toThrow(RangeError);
  });
});

describe("applySampleThreshold (A4)", () => {
  it("withholds every figure below the threshold", () => {
    const s = applySampleThreshold({ n: MIN_SALES - 1, median: 3000, p25: 2500, p75: 3500 });
    expect(s).toEqual({ n: MIN_SALES - 1, reliability: "low_sample", median: null, p25: null, p75: null });
  });
  it("publishes rounded figures at or above the threshold", () => {
    const s = applySampleThreshold({ n: MIN_SALES, median: 3000.4, p25: 2500.6, p75: null });
    expect(s).toEqual({ n: MIN_SALES, reliability: "ok", median: 3000, p25: 2501, p75: null });
  });
  it("treats a missing median as low sample", () => {
    expect(applySampleThreshold({ n: 50, median: null }).reliability).toBe("low_sample");
  });
});
