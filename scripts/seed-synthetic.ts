/**
 * Generates SYNTHETIC files with the exact geo-dvf CSV layout (plus IRIS
 * GeoJSON) for local development and CI, where data.gouv.fr may be
 * unreachable. Commune codes/names are real Hérault references; streets,
 * prices and IRIS geometries are invented. The import run is tagged
 * source="synthetic" and the UI shows a "données de démonstration" banner.
 *
 *   pnpm db:seed:synthetic            # writes data/fixtures/synthetic, then imports it
 *   pnpm db:seed:synthetic --no-import
 */
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import path from "node:path";

const OUT = "data/fixtures/synthetic";
const YEARS = [2021, 2022, 2023, 2024, 2025];
const TREND: Record<number, number> = { 2021: 1, 2022: 1.06, 2023: 1.05, 2024: 0.99, 2025: 1.0 };
const MUTATIONS_PER_YEAR = Number(process.env.SYNTH_PER_YEAR ?? 20000);

// Deterministic PRNG (mulberry32) so fixtures and tests are reproducible.
let seed = 0x5eed;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const pickW = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;

interface Commune { code: string; name: string; lat: number; lon: number; base: number; weight: number; cols: number; rows: number; quartiers?: string[] }
const COMMUNES: Commune[] = [
  { code: "34172", name: "Montpellier", lat: 43.6108, lon: 3.8767, base: 3900, weight: 0.42, cols: 4, rows: 3,
    quartiers: ["Écusson", "Antigone", "Port Marianne", "Beaux-Arts", "Boutonnet", "Les Arceaux", "Hôpitaux-Facultés", "Croix d'Argent", "Mosson", "Près d'Arènes", "Aiguelongue", "Estanove"] },
  { code: "34032", name: "Béziers", lat: 43.3442, lon: 3.2158, base: 1900, weight: 0.14, cols: 2, rows: 2, quartiers: ["Centre-Ville", "La Devèze", "Faubourg", "Montimaran"] },
  { code: "34301", name: "Sète", lat: 43.4028, lon: 3.6928, base: 3500, weight: 0.1, cols: 3, rows: 1, quartiers: ["Corniche", "Quartier Haut", "Île de Thau"] },
  { code: "34003", name: "Agde", lat: 43.3108, lon: 3.4758, base: 3300, weight: 0.08, cols: 2, rows: 1, quartiers: ["Agde Centre", "Le Cap d'Agde"] },
  { code: "34129", name: "Lattes", lat: 43.5675, lon: 3.9097, base: 4300, weight: 0.07, cols: 1, rows: 1 },
  { code: "34057", name: "Castelnau-le-Lez", lat: 43.6336, lon: 3.9019, base: 4200, weight: 0.07, cols: 1, rows: 1 },
  { code: "34145", name: "Lunel", lat: 43.6747, lon: 4.1356, base: 2600, weight: 0.07, cols: 1, rows: 1 },
  { code: "34198", name: "Pérols", lat: 43.5653, lon: 3.9531, base: 4400, weight: 0.05, cols: 1, rows: 1 },
];
const CELL = 0.018; // degrees

const STREET_TYPES = ["Rue", "Avenue", "Boulevard", "Impasse", "Place", "Chemin", "Allée"];
const STREET_NAMES = ["de la République", "Victor Hugo", "Jean Jaurès", "des Lilas", "du Moulin", "Pasteur", "de la Gare", "Gambetta",
  "Foch", "des Écoles", "de la Mer", "des Oliviers", "Paul Valéry", "Jules Ferry", "des Pins", "du Stade", "de Lodève", "de Nîmes",
  "des Vignes", "Saint-Louis", "de la Liberté", "des Arts", "du Lez", "Émile Zola", "des Cigales", "du Château", "Molière", "des Platanes"];

interface Cell { code: string; name: string; commune: Commune; minLon: number; minLat: number; factor: number }
interface Street { code: string; name: string; cell: Cell; lon: number; lat: number; factor: number }

const cells: Cell[] = [];
for (const c of COMMUNES) {
  const lon0 = c.lon - (c.cols * CELL) / 2;
  const lat0 = c.lat - (c.rows * CELL) / 2;
  let i = 0;
  for (let r = 0; r < c.rows; r++)
    for (let k = 0; k < c.cols; k++, i++) {
      const split = c.cols * c.rows > 1;
      cells.push({
        code: `${c.code}${split ? String(101 + i).padStart(4, "0") : "0000"}`,
        name: split ? c.quartiers![i]! : c.name,
        commune: c,
        minLon: lon0 + k * CELL,
        minLat: lat0 + r * CELL,
        factor: Math.exp(gauss() * 0.18),
      });
    }
}

const streets: Street[] = [];
for (const cell of cells) {
  const count = 10 + Math.floor(rand() * 20);
  for (let i = 0; i < count; i++) {
    streets.push({
      code: `${String.fromCharCode(65 + (streets.length % 26))}${String(streets.length).padStart(3, "0")}`.slice(-4),
      name: `${pickW(STREET_TYPES)} ${pickW(STREET_NAMES)}`.toUpperCase(),
      cell,
      lon: cell.minLon + CELL * (0.1 + 0.8 * rand()),
      lat: cell.minLat + CELL * (0.1 + 0.8 * rand()),
      factor: Math.exp(gauss() * 0.1),
    });
  }
}
const pickStreet = (() => {
  const byCommune = new Map<string, Street[]>();
  for (const s of streets) {
    const l = byCommune.get(s.cell.commune.code) ?? [];
    l.push(s);
    byCommune.set(s.cell.commune.code, l);
  }
  return () => {
    let x = rand();
    const c = COMMUNES.find((cm) => (x -= cm.weight) <= 0) ?? COMMUNES[0]!;
    // 40% of streets share only 3% of sales: a long tail of low-sample
    // streets, like real data, so the A4 logic is exercised.
    const list = byCommune.get(c.code)!;
    const head = Math.ceil(list.length * 0.6);
    return rand() < 0.97 ? list[Math.floor(rand() * head)]! : list[head + Math.floor(rand() * (list.length - head))] ?? list[0]!;
  };
})();

const HEADER = ("id_mutation,date_mutation,numero_disposition,nature_mutation,valeur_fonciere,adresse_numero,adresse_suffixe," +
  "adresse_nom_voie,adresse_code_voie,code_postal,code_commune,nom_commune,code_departement,ancien_code_commune,ancien_nom_commune," +
  "id_parcelle,ancien_id_parcelle,numero_volume,lot1_numero,lot1_surface_carrez,lot2_numero,lot2_surface_carrez,lot3_numero," +
  "lot3_surface_carrez,lot4_numero,lot4_surface_carrez,lot5_numero,lot5_surface_carrez,nombre_lots,code_type_local,type_local," +
  "surface_reelle_bati,nombre_pieces_principales,code_nature_culture,nature_culture,code_nature_culture_speciale," +
  "nature_culture_speciale,surface_terrain,longitude,latitude").split(",");

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function generateYear(year: number): string {
  const lines = [HEADER.join(",")];
  const row = (o: Record<string, unknown>) => lines.push(HEADER.map((h) => csvCell(o[h])).join(","));
  for (let m = 1; m <= MUTATIONS_PER_YEAR; m++) {
    const st = pickStreet();
    const c = st.cell.commune;
    const apartmentShare = c.code === "34172" ? 0.75 : 0.45;
    const isApt = rand() < apartmentShare;
    const surface = Math.round(isApt ? 25 + Math.abs(gauss()) * 40 : 70 + Math.abs(gauss()) * 50);
    const typeFactor = isApt ? 1 : 0.92;
    let price = c.base * st.cell.factor * st.factor * typeFactor * TREND[year]! * Math.exp(gauss() * 0.16);
    const roll = rand();
    if (roll < 0.01) price *= rand() < 0.5 ? 8 : 0.08; // aberrant → R-FENCE / R-BOUNDS
    const value = roll < 0.004 ? 1 : Math.round(price * surface);
    const date = `${year}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`;
    const nature = rand() < 0.03 ? pickW(["Échange", "Adjudication", "Vente terrain à bâtir"]) : rand() < 0.06 ? "Vente en l'état futur d'achèvement" : "Vente";
    const noCoords = rand() < 0.015;
    const jitter = () => (gauss() * CELL) / 25;
    const base = {
      id_mutation: `${year}-${m}`,
      date_mutation: rand() < 0.002 ? "31/12/2023" : date, // a few malformed rows → Zod rejects
      numero_disposition: "000001",
      nature_mutation: nature,
      valeur_fonciere: value,
      adresse_numero: 1 + Math.floor(rand() * 120),
      adresse_nom_voie: st.name,
      adresse_code_voie: st.code,
      code_postal: c.code === "34172" ? "34000" : "34" + c.code.slice(2),
      code_commune: c.code,
      nom_commune: c.name,
      code_departement: "34",
      id_parcelle: `${c.code}000${pickW(["AB", "CD", "EK", "HN"])}${String(Math.floor(rand() * 9999)).padStart(4, "0")}`,
      longitude: noCoords ? "" : (st.lon + jitter()).toFixed(6),
      latitude: noCoords ? "" : (st.lat + jitter()).toFixed(6),
    };
    const dwelling = {
      ...base,
      lot1_numero: isApt ? String(1 + Math.floor(rand() * 80)) : "",
      nombre_lots: isApt ? 1 : 0,
      code_type_local: isApt ? 2 : 1,
      type_local: isApt ? "Appartement" : "Maison",
      surface_reelle_bati: surface,
      nombre_pieces_principales: Math.max(1, Math.round(surface / 22)),
    };
    if (isApt) row(dwelling);
    else {
      // Houses: one line per parcel culture — the importer must dedupe these.
      row({ ...dwelling, code_nature_culture: "S", nature_culture: "sols", surface_terrain: 300 });
      if (rand() < 0.5) row({ ...dwelling, code_nature_culture: "AG", nature_culture: "terrains d'agrément", surface_terrain: 200 });
    }
    const extra = rand();
    if (extra < 0.1) row({ ...base, code_type_local: 3, type_local: "Dépendance" });
    else if (extra < 0.15) row({ ...dwelling, lot1_numero: "999", surface_reelle_bati: 40 }); // 2 dwellings
    else if (extra < 0.17) row({ ...base, code_type_local: 4, type_local: "Local industriel. commercial ou assimilé", surface_reelle_bati: 80 });
  }
  return lines.join("\n") + "\n";
}

function irisGeoJson() {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      properties: { iris_code: [c.code], iris_name: [c.name], com_code: [c.commune.code], com_name: [c.commune.name] },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [c.minLon, c.minLat], [c.minLon + CELL, c.minLat], [c.minLon + CELL, c.minLat + CELL], [c.minLon, c.minLat + CELL], [c.minLon, c.minLat],
        ]],
      },
    })),
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "iris-34.geojson"), JSON.stringify(irisGeoJson()));
  for (const y of YEARS) {
    await mkdir(path.join(OUT, String(y)), { recursive: true });
    await writeFile(path.join(OUT, String(y), "34.csv.gz"), gzipSync(generateYear(y)));
    console.log(`synthetic ${y}: ${MUTATIONS_PER_YEAR} mutations`);
  }
  if (!process.argv.includes("--no-import")) {
    execFileSync("pnpm", ["data:import", "--dept", "34", "--years", "2021-2025", "--source", "synthetic", "--source-dir", OUT], { stdio: "inherit" });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
