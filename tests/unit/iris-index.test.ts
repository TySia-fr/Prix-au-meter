import { describe, expect, it } from "vitest";
import { IrisIndex, pointInGeometry, type IrisFeature } from "@/lib/geo/iris-index";
import { parseIrisGeoJson } from "@/lib/geo/iris-source";

type Ring = [number, number][];
const ring = (x: number, y: number, s = 1): Ring => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const square = (x: number, y: number, s = 1): IrisFeature["geometry"] => ({ type: "Polygon", coordinates: [ring(x, y, s)] });

describe("point in polygon", () => {
  it("handles holes", () => {
    const g = { type: "Polygon" as const, coordinates: [ring(0, 0, 10), ring(4, 4, 2)] };
    expect(pointInGeometry(1, 1, g)).toBe(true);
    expect(pointInGeometry(5, 5, g)).toBe(false);
  });
});

describe("IrisIndex", () => {
  const idx = new IrisIndex([
    { code: "341720101", name: "A", communeCode: "34172", geometry: square(0, 0) },
    { code: "341290000", name: "B", communeCode: "34129", geometry: square(0.5, 0) },
  ]);
  it("finds the containing IRIS", () => expect(idx.lookup(0.2, 0.5)).toBe("341720101"));
  it("prefers the sale's own commune on overlaps", () => expect(idx.lookup(0.7, 0.5, "34129")).toBe("341290000"));
  it("returns null outside every IRIS", () => expect(idx.lookup(5, 5)).toBeNull());
});

describe("parseIrisGeoJson", () => {
  it("normalises IGN and Opendatasoft property names and skips invalid features", () => {
    const { features, invalid } = parseIrisGeoJson({
      features: [
        { properties: { CODE_IRIS: "341720101", NOM_IRIS: "Écusson", INSEE_COM: "34172" }, geometry: square(0, 0) },
        { properties: { iris_code: ["341720102"], iris_name: ["Antigone"], com_code: ["34172"] }, geometry: square(1, 0) },
        { properties: { iris_code: "bad" }, geometry: square(2, 0) },
      ],
    });
    expect(features.map((f) => f.name)).toEqual(["Écusson", "Antigone"]);
    expect(invalid).toBe(1);
  });
});
