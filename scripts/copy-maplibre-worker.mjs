// MapLibre v6 loads its web worker relative to its own module URL, which
// breaks once bundled. We serve the worker from /public and set it explicitly.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
mkdirSync("public/maplibre", { recursive: true });
copyFileSync(`${dist}/maplibre-gl-worker.mjs`, "public/maplibre/maplibre-gl-worker.mjs");
console.log("maplibre worker copied to public/maplibre/");
