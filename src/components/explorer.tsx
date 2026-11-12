"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PriceMap, STREET_ZOOM, type MapFeatureProps } from "./price-map";
import { SearchBox } from "./search-box";
import { TrendChart } from "./trend-chart";
import { StatValue } from "./stat-card";
import { FavoriteButton } from "./favorite-button";
import { legendItems, LOW_SAMPLE_COLOR } from "@/lib/colors";
import { formatInt, formatPricePerM2, titleCaseStreet } from "@/lib/format";
import { PROPERTY_LABELS, type AreaPayload, type PropertyKey, type SearchHit, type StreetPayload } from "@/lib/types";

const SERIES_COLORS: Record<PropertyKey, string> = { ALL: "#7c9cff", APARTMENT: "#5ec962", HOUSE: "#f5c06b" };

export function trendSeries(area: AreaPayload) {
  return (["ALL", "APARTMENT", "HOUSE"] as const).map((t) => ({
    label: PROPERTY_LABELS[t],
    color: SERIES_COLORS[t],
    dash: t === "ALL" ? undefined : "4 3",
    points: area.trend.map((p) => ({ year: p.year, value: p.byType[t].median, n: p.byType[t].n })),
  }));
}

export function Explorer({ period, signedIn }: { period: { yearFrom: number; yearTo: number }; signedIn: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const zone = params.get("zone"); // "iris:341720101" | "commune:34172"
  const [area, setArea] = useState<AreaPayload | null>(null);
  const [street, setStreet] = useState<StreetPayload | null>(null);
  const [focus, setFocus] = useState<{ lon: number; lat: number; zoom: number } | null>(null);
  const [visible, setVisible] = useState<{ layer: "streets" | "communes"; items: MapFeatureProps[] }>({ layer: "streets", items: [] });
  const [error, setError] = useState<string | null>(null);

  const selectZone = useCallback(
    (level: string, code: string) => router.replace(`${pathname}?zone=${level}:${code}` as never, { scroll: false }),
    [router, pathname],
  );

  // URL is the source of truth for the selected area (shareable links, back button).
  useEffect(() => {
    if (!zone) return;
    const [level, code] = zone.split(":");
    const ctrl = new AbortController();
    fetch(`/api/areas/${level}/${code}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Zone introuvable" : "Erreur de chargement");
        const a = (await r.json()) as AreaPayload;
        setArea(a);
        setError(null);
        if (a.center) setFocus({ ...a.center, zoom: a.level === "iris" ? 14.5 : STREET_ZOOM });
      })
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctrl.abort();
  }, [zone]);

  const openStreet = useCallback(async (key: string) => {
    const r = await fetch(`/api/streets/${encodeURIComponent(key)}`);
    if (r.ok) setStreet((await r.json()) as StreetPayload);
  }, []);

  const onSearch = (h: SearchHit) => {
    setStreet(null);
    selectZone(h.level, h.code);
  };

  return (
    <div className="relative flex flex-1 flex-col md:flex-row">
      <aside aria-label="Panneau d'exploration" className="z-10 flex w-full flex-col gap-4 overflow-y-auto border-border bg-surface p-4 md:w-[400px] md:border-r">
        <SearchBox onSelect={onSearch} />
        <p className="text-xs text-muted">
          Prix médian au m² des maisons et appartements vendus entre {period.yearFrom} et {period.yearTo}. Zoomez pour voir les rues.
        </p>

        {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}

        {street && (
          <section aria-labelledby="street-title" className="animate-fade-up rounded-xl border border-border bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 id="street-title" className="font-semibold">{titleCaseStreet(street.name)}</h2>
              <button type="button" onClick={() => setStreet(null)} className="text-xs text-muted hover:text-fg" aria-label="Fermer le détail de la rue">✕</button>
            </div>
            <div className="mt-2"><StatValue stat={street} /></div>
            {street.irisCode && (
              <button type="button" onClick={() => selectZone("iris", street.irisCode!)} className="mt-3 text-sm text-accent hover:underline">
                Voir le quartier et son évolution →
              </button>
            )}
          </section>
        )}

        {area && (
          <section aria-labelledby="area-title" key={`${area.level}:${area.code}`} className="animate-fade-up space-y-4 rounded-xl border border-border bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">{area.level === "iris" ? `Quartier · ${area.communeName}` : "Commune"}</p>
                <h2 id="area-title" className="text-lg font-semibold">{area.name}</h2>
              </div>
              {area.level === "iris" && <FavoriteButton irisCode={area.code} signedIn={signedIn} />}
            </div>
            <StatValue stat={area.stats.ALL} />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(["APARTMENT", "HOUSE"] as const).map((t) => (
                <div key={t} className="rounded-lg bg-surface p-3">
                  <dt className="text-xs text-muted">{PROPERTY_LABELS[t]}</dt>
                  <dd className="font-medium tabular-nums">
                    {area.stats[t].reliability === "ok" ? formatPricePerM2(area.stats[t].median) : "Données insuffisantes"}
                    <span className="block text-xs font-normal text-muted">{formatInt(area.stats[t].n)} ventes</span>
                  </dd>
                </div>
              ))}
            </dl>
            <div>
              <h3 className="mb-2 text-sm font-medium">Évolution du prix médian au m²</h3>
              <TrendChart title={`Évolution du prix médian au m² — ${area.name}`} series={trendSeries(area)} />
            </div>
            {area.level === "iris" && (
              <Link href={`/comparer?a=iris:${area.code}`} className="inline-block rounded-lg border border-border px-3 py-2 text-sm transition hover:border-accent hover:text-accent">
                Comparer ce quartier
              </Link>
            )}
          </section>
        )}

        <section aria-labelledby="legend-title">
          <h2 id="legend-title" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Légende · prix médian au m²</h2>
          <ul className="grid grid-cols-2 gap-1 text-xs">
            {legendItems().map((l) => (
              <li key={l.label} className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-full" style={{ background: l.color }} />{l.label}</li>
            ))}
            <li className="col-span-2 flex items-center gap-2"><span aria-hidden className="size-3 rounded-full opacity-50" style={{ background: LOW_SAMPLE_COLOR }} />Moins de 10 ventes : pas de prix affiché</li>
          </ul>
        </section>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-fg">
            {visible.layer === "streets" ? "Rues visibles" : "Communes visibles"} ({visible.items.length})
          </summary>
          <ul className="mt-2 max-h-64 space-y-1 overflow-auto" aria-label="Zones visibles sur la carte">
            {visible.items.slice(0, 100).map((it) => (
              <li key={it.key ?? it.code}>
                <button
                  type="button"
                  onClick={() => (it.key ? openStreet(it.key) : it.code && selectZone("commune", it.code))}
                  className="flex w-full justify-between gap-2 rounded px-2 py-1 text-left hover:bg-surface-2"
                >
                  <span className="truncate">{it.key ? titleCaseStreet(it.name) : it.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">{it.reliability === "ok" ? formatPricePerM2(it.median) : `${it.n} ventes`}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      </aside>

      <div className="relative min-h-[60vh] flex-1">
        <PriceMap
          focus={focus}
          highlight={area?.geometry ?? null}
          selectedStreet={street?.key ?? null}
          onStreet={openStreet}
          onCommune={(code) => selectZone("commune", code)}
          onVisible={(layer, items) => setVisible({ layer, items })}
        />
      </div>
    </div>
  );
}
