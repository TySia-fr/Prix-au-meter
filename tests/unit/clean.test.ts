import { describe, expect, it } from "vitest";
import { applyFences, cleanMutation, computeFence, type CleanSale } from "@/lib/dvf/clean";
import { rawDvfRowSchema, type RawDvfRow } from "@/lib/dvf/raw-row";

const row = (o: Partial<Record<string, string>> = {}): RawDvfRow =>
  rawDvfRowSchema.parse({
    id_mutation: "2024-1", date_mutation: "2024-05-03", nature_mutation: "Vente", valeur_fonciere: "300000",
    adresse_nom_voie: "RUE DE LA LOGE", adresse_code_voie: "A123", code_commune: "34172", nom_commune: "Montpellier",
    code_departement: "34", id_parcelle: "34172000AB0001", lot1_numero: "12", type_local: "Appartement",
    surface_reelle_bati: "75", nombre_pieces_principales: "3", longitude: "3.8767", latitude: "43.6108", ...o,
  });

describe("raw row validation (Zod)", () => {
  it("coerces numbers and maps empty strings to null", () => {
    const r = row({ valeur_fonciere: "", surface_reelle_bati: "42" });
    expect(r.valeur_fonciere).toBeNull();
    expect(r.surface_reelle_bati).toBe(42);
  });
  it("rejects malformed dates and commune codes", () => {
    expect(() => row({ date_mutation: "03/05/2024" })).toThrow();
    expect(() => row({ code_commune: "ABC" })).toThrow();
  });
  it("accepts Corsican codes", () => {
    expect(row({ code_commune: "2A004", code_departement: "2A" }).code_departement).toBe("2A");
  });
});

describe("cleanMutation (A3 rules)", () => {
  it("keeps a single apartment sale and computes price per m²", () => {
    const r = cleanMutation([row()]);
    expect(r.ok && r.sale).toMatchObject({ propertyType: "APARTMENT", pricePerM2: 4000, streetKey: "34172_A123", year: 2024 });
  });
  it("dedupes the same house repeated once per parcel culture line", () => {
    const h = { type_local: "Maison", lot1_numero: "", surface_reelle_bati: "100" };
    expect(cleanMutation([row(h), row(h)]).ok).toBe(true);
  });
  it("allows outbuildings but rejects multi-dwelling and mixed-use mutations", () => {
    expect(cleanMutation([row(), row({ type_local: "Dépendance", surface_reelle_bati: "" })]).ok).toBe(true);
    expect(cleanMutation([row(), row({ lot1_numero: "13" })])).toEqual({ ok: false, reason: "multiple_dwellings" });
    expect(cleanMutation([row(), row({ type_local: "Local industriel. commercial ou assimilé" })])).toEqual({ ok: false, reason: "mixed_use" });
  });
  it.each([
    [{ nature_mutation: "Échange" }, "nature"],
    [{ type_local: "Dépendance" }, "no_dwelling"],
    [{ valeur_fonciere: "0" }, "value"],
    [{ surface_reelle_bati: "8" }, "surface"],
    [{ surface_reelle_bati: "1001" }, "surface"],
    [{ latitude: "" }, "coords"],
    [{ latitude: "60" }, "coords"],
    [{ valeur_fonciere: "1" }, "price_bounds"],
    [{ valeur_fonciere: "3000000", surface_reelle_bati: "20" }, "price_bounds"],
  ])("rejects %o as %s", (override, reason) => {
    expect(cleanMutation([row(override)])).toEqual({ ok: false, reason });
  });
  it("accepts VEFA (off-plan) sales", () => {
    expect(cleanMutation([row({ nature_mutation: "Vente en l'état futur d'achèvement" })]).ok).toBe(true);
  });
});

describe("statistical fences (R-FENCE)", () => {
  const sale = (pricePerM2: number, i: number): CleanSale => ({
    departmentCode: "34", mutationId: String(i), date: "2024-01-01", year: 2024, communeCode: "34172", communeName: "M",
    streetKey: "k", streetName: "s", propertyType: "APARTMENT", surface: 50, rooms: 2, value: pricePerM2 * 50, pricePerM2, lat: 43, lon: 3,
  });
  it("does not fence groups smaller than 30", () => {
    expect(computeFence(Array(29).fill(3000))).toBeNull();
  });
  it("drops extreme prices but keeps the normal spread", () => {
    const prices = Array.from({ length: 100 }, (_, i) => 3000 + i * 10);
    const { kept, rejected } = applyFences([...prices, 40, 29000].map(sale));
    expect(rejected).toBe(2);
    expect(kept).toHaveLength(100);
  });
});
