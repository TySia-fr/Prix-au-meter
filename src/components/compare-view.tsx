"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchBox } from "./search-box";
import { StatValue } from "./stat-card";
import { TrendChart } from "./trend-chart";
import { formatInt, formatPct, formatPricePerM2 } from "@/lib/format";
import { PROPERTY_LABELS, type AreaPayload } from "@/lib/types";

const COLORS = { a: "#7c9cff", b: "#f5c06b" } as const;

function useArea(ref: string | null) {
  const [area, setArea] = useState<AreaPayload | null>(null);
  useEffect(() => {
    if (!ref || !/^(iris|commune):[0-9AB]{5,9}$/.test(ref)) return;
    const ctrl = new AbortController();
    const [level, code] = ref.split(":");
    fetch(`/api/areas/${level}/${code}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<AreaPayload>) : null))
      .then(setArea)
      .catch(() => {});
    return () => ctrl.abort();
  }, [ref]);
  return ref ? area : null;
}

export function CompareView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const refs = { a: params.get("a"), b: params.get("b") };
  const a = useArea(refs.a);
  const b = useArea(refs.b);

  const set = (slot: "a" | "b", value: string) => {
    const next = new URLSearchParams(params);
    next.set(slot, value);
    router.replace(`${pathname}?${next}` as never, { scroll: false });
  };

  const diff = a?.stats.ALL.median != null && b?.stats.ALL.median != null ? ((b.stats.ALL.median - a.stats.ALL.median) / a.stats.ALL.median) * 100 : null;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {(["a", "b"] as const).map((slot) => {
          const area = slot === "a" ? a : b;
          return (
            <section key={slot} aria-labelledby={`cmp-${slot}`} className="animate-fade-up space-y-4 rounded-xl border border-border bg-surface p-4" style={{ borderTopColor: COLORS[slot], borderTopWidth: 3 }}>
              <h2 id={`cmp-${slot}`} className="sr-only">{slot === "a" ? "Premier" : "Second"} quartier{area ? ` : ${area.name}` : ""}</h2>
              <SearchBox id={`compare-${slot}`} label={slot === "a" ? "Premier quartier" : "Second quartier"} onSelect={(h) => set(slot, `${h.level}:${h.code}`)} />
              {area ? (
                <div className="space-y-3" data-testid={`compare-${slot}`}>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted">{area.level === "iris" ? `Quartier · ${area.communeName}` : "Commune"}</p>
                    <p className="text-lg font-semibold">{area.name}</p>
                  </div>
                  <StatValue stat={area.stats.ALL} />
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    {(["APARTMENT", "HOUSE"] as const).map((t) => (
                      <div key={t} className="rounded-lg bg-surface-2 p-3">
                        <dt className="text-xs text-muted">{PROPERTY_LABELS[t]}</dt>
                        <dd className="tabular-nums">{area.stats[t].reliability === "ok" ? formatPricePerM2(area.stats[t].median) : "Données insuffisantes"}
                          <span className="block text-xs text-muted">{formatInt(area.stats[t].n)} ventes</span></dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <p className="text-sm text-muted">Choisissez un quartier ou une commune.</p>
              )}
            </section>
          );
        })}
      </div>

      {a && b && (
        <section aria-labelledby="cmp-trend" className="animate-fade-up rounded-xl border border-border bg-surface p-4">
          <h2 id="cmp-trend" className="font-medium">Évolution comparée</h2>
          <p className="mb-3 text-sm text-muted" data-testid="compare-diff">
            {diff == null ? "Écart non calculable : données insuffisantes pour l'une des deux zones." : `${b.name} est ${formatPct(diff)} par rapport à ${a.name}.`}
          </p>
          <TrendChart
            title={`Prix médian au m² : ${a.name} et ${b.name}`}
            series={[a, b].map((z, i) => ({
              label: z.name,
              color: i === 0 ? COLORS.a : COLORS.b,
              points: z.trend.map((p) => ({ year: p.year, value: p.byType.ALL.median, n: p.byType.ALL.n })),
            }))}
          />
        </section>
      )}
    </div>
  );
}
