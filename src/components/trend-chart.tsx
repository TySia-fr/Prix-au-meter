import { formatInt, formatPricePerM2 } from "@/lib/format";

export interface Series {
  label: string;
  color: string;
  dash?: string;
  points: { year: number; value: number | null; n: number }[];
}

const W = 360;
const H = 180;
const PAD = { l: 52, r: 12, t: 12, b: 26 };

/**
 * Dependency-free SVG line chart. Low-sample years have value=null and are
 * drawn as gaps (never interpolated). A data table carries the same
 * information for screen readers and keyboard users.
 */
export function TrendChart({ series, title }: { series: Series[]; title: string }) {
  const years = [...new Set(series.flatMap((s) => s.points.map((p) => p.year)))].sort();
  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v != null);
  if (years.length === 0 || values.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">Pas assez de ventes pour tracer une évolution.</p>;
  }
  const min = Math.min(...values) * 0.95;
  const max = Math.max(...values) * 1.05;
  const x = (y: number) => PAD.l + (years.length === 1 ? 0.5 : years.indexOf(y) / (years.length - 1)) * (W - PAD.l - PAD.r);
  const yv = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.5, 1].map((f) => min + f * (max - min));

  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    for (const p of [...s.points].sort((a, b) => a.year - b.year)) {
      if (p.value == null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(p.year).toFixed(1)},${yv(p.value).toFixed(1)}`;
      pen = true;
    }
    return d;
  });

  return (
    <figure className="space-y-2">
      <figcaption className="sr-only">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}. Détail dans le tableau ci-dessous.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yv(t)} y2={yv(t)} stroke="var(--color-border)" strokeDasharray="2 4" />
            <text x={PAD.l - 6} y={yv(t) + 4} textAnchor="end" fontSize="10" fill="var(--color-muted)">{Math.round(t).toLocaleString("fr-FR")} €</text>
          </g>
        ))}
        {years.map((y) => (
          <text key={y} x={x(y)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-muted)">{y}</text>
        ))}
        {series.map((s, i) => (
          <g key={s.label}>
            <path d={paths[i]} pathLength={1000} fill="none" stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dash}
              strokeLinejoin="round" strokeLinecap="round" className={s.dash ? undefined : "line-draw"} />
            {s.points.map((p) => p.value != null && <circle key={p.year} cx={x(p.year)} cy={yv(p.value)} r="3" fill={s.color} />)}
          </g>
        ))}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: s.color }} /> {s.label}
          </li>
        ))}
      </ul>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted hover:text-fg">Voir les données</summary>
        <table className="mt-2 w-full border-collapse text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 font-medium">Année</th>
              {series.map((s) => <th key={s.label} scope="col" className="py-1 font-medium">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y} className="border-t border-border">
                <th scope="row" className="py-1 font-normal">{y}</th>
                {series.map((s) => {
                  const p = s.points.find((pt) => pt.year === y);
                  return (
                    <td key={s.label} className="py-1 tabular-nums">
                      {p?.value != null ? formatPricePerM2(p.value) : "Données insuffisantes"}
                      {p && <span className="text-muted"> ({formatInt(p.n)} ventes)</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
