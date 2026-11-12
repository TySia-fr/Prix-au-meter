"use client";
import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import { colorExpression } from "@/lib/colors";
import { formatInt, formatPricePerM2, titleCaseStreet } from "@/lib/format";

export const STREET_ZOOM = 13;
const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/dark";
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0d1017" } }],
};

export interface MapFeatureProps {
  key?: string;
  code?: string;
  name: string;
  n: number;
  median: number | null;
  reliability: "ok" | "low_sample";
}

interface Props {
  focus: { lon: number; lat: number; zoom: number } | null;
  highlight: GeoJSON.Geometry | null;
  selectedStreet: string | null;
  onStreet: (key: string) => void;
  onCommune: (code: string) => void;
  onVisible: (layer: "streets" | "communes", items: MapFeatureProps[]) => void;
}

/** Loads the remote basemap style; falls back to a plain dark background if unreachable. */
async function loadStyle(): Promise<StyleSpecification | string> {
  try {
    const res = await fetch(STYLE_URL, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as StyleSpecification;
  } catch {
    return FALLBACK_STYLE;
  }
}

export function PriceMap({ focus, highlight, selectedStreet, onStreet, onCommune, onVisible }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const handlers = useRef({ onStreet, onCommune, onVisible });
  useEffect(() => {
    handlers.current = { onStreet, onCommune, onVisible };
  });

  useEffect(() => {
    let disposed = false;
    let ctrl: AbortController | null = null;
    (async () => {
      const [maplibregl, style] = await Promise.all([import("maplibre-gl"), loadStyle()]);
      if (disposed || !container.current) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const map = new maplibregl.Map({
        container: container.current,
        style,
        center: [3.8767, 43.6108],
        zoom: 12.5,
        attributionControl: { compact: true, customAttribution: "Données DVF © DGFiP / Etalab" },
        fadeDuration: reduceMotion ? 0 : 300,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.getCanvas().setAttribute("aria-label", "Carte des prix au m². Utilisez la liste des rues visibles pour une navigation au clavier.");

      map.on("load", () => {
        const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
        map.addSource("prices", { type: "geojson", data: empty });
        map.addSource("highlight", { type: "geojson", data: empty });
        map.addLayer({ id: "highlight-fill", type: "fill", source: "highlight", paint: { "fill-color": "#7c9cff", "fill-opacity": 0.08 } });
        map.addLayer({ id: "highlight-line", type: "line", source: "highlight", paint: { "line-color": "#7c9cff", "line-width": 2 } });
        map.addLayer({
          id: "prices",
          type: "circle",
          source: "prices",
          paint: {
            "circle-color": colorExpression() as never,
            "circle-opacity": ["case", ["==", ["get", "reliability"], "ok"], 0.9, 0.35],
            "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "n"]], 1, 4, 10, 10, 40, 22],
            "circle-stroke-width": ["case", ["==", ["get", "key"], ["literal", "__selected__"]], 3, 1],
            "circle-stroke-color": "#0a0b0f",
          },
        });

        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
        map.on("mousemove", "prices", (e: MapLayerMouseEvent) => {
          const p = e.features?.[0]?.properties as MapFeatureProps | undefined;
          if (!p) return;
          map.getCanvas().style.cursor = "pointer";
          const name = p.key ? titleCaseStreet(p.name) : p.name;
          const value = p.reliability === "ok" ? formatPricePerM2(Number(p.median)) : "Données insuffisantes";
          popup.setLngLat(e.lngLat).setHTML(`<strong>${escapeHtml(name)}</strong><br/>${value} · ${formatInt(Number(p.n))} ventes`).addTo(map);
        });
        map.on("mouseleave", "prices", () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });
        map.on("click", "prices", (e: MapLayerMouseEvent) => {
          const p = e.features?.[0]?.properties as MapFeatureProps | undefined;
          if (p?.key) handlers.current.onStreet(p.key);
          else if (p?.code) handlers.current.onCommune(p.code);
        });

        const refresh = async () => {
          const b = map.getBounds();
          const layer = map.getZoom() >= STREET_ZOOM ? "streets" : "communes";
          ctrl?.abort();
          ctrl = new AbortController();
          const params = new URLSearchParams({
            layer,
            minLon: b.getWest().toFixed(5), minLat: b.getSouth().toFixed(5),
            maxLon: b.getEast().toFixed(5), maxLat: b.getNorth().toFixed(5),
          });
          try {
            const res = await fetch(`/api/map?${params}`, { signal: ctrl.signal });
            if (!res.ok) return;
            const fc = (await res.json()) as GeoJSON.FeatureCollection;
            (map.getSource("prices") as GeoJSONSource | undefined)?.setData(fc);
            handlers.current.onVisible(layer, fc.features.map((f) => f.properties as MapFeatureProps));
          } catch {
            /* aborted by a newer viewport */
          }
        };
        map.on("moveend", refresh);
        void refresh();
        container.current?.setAttribute("data-map-ready", "true");
      });
    })();
    return () => {
      disposed = true;
      ctrl?.abort();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map[reduce ? "jumpTo" : "flyTo"]({ center: [focus.lon, focus.lat], zoom: focus.zoom, ...(reduce ? {} : { duration: 900 }) });
  }, [focus]);

  useEffect(() => {
    const map = mapRef.current;
    const apply = () => {
      const src = map?.getSource("highlight") as GeoJSONSource | undefined;
      src?.setData(highlight ? { type: "Feature", geometry: highlight, properties: {} } : { type: "FeatureCollection", features: [] });
    };
    if (map?.isStyleLoaded()) apply();
    else map?.once("load", apply);
  }, [highlight]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("prices")) {
      map.setPaintProperty("prices", "circle-stroke-width", ["case", ["==", ["get", "key"], selectedStreet ?? "__none__"], 3, 1]);
      map.setPaintProperty("prices", "circle-stroke-color", ["case", ["==", ["get", "key"], selectedStreet ?? "__none__"], "#ffffff", "#0a0b0f"]);
    }
  }, [selectedStreet]);

  return <div ref={container} className="absolute inset-0" data-testid="map" />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
