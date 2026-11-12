import type { PublicStat } from "@/lib/stats";
import { formatInt, formatPricePerM2 } from "@/lib/format";
import { MIN_SALES } from "@/lib/stats";

export function StatValue({ stat, size = "lg" }: { stat: PublicStat; size?: "lg" | "sm" }) {
  if (stat.reliability === "low_sample") {
    return (
      <div>
        <p className={`${size === "lg" ? "text-xl" : "text-base"} font-semibold text-muted`}>Données insuffisantes</p>
        <p className="text-xs text-muted">{formatInt(stat.n)} vente{stat.n > 1 ? "s" : ""} — minimum {MIN_SALES} pour afficher un prix</p>
      </div>
    );
  }
  return (
    <div>
      <p className={`${size === "lg" ? "text-3xl" : "text-xl"} font-semibold tabular-nums tracking-tight`}>{formatPricePerM2(stat.median)}</p>
      <p className="text-xs text-muted tabular-nums">
        médiane · {formatInt(stat.n)} ventes · 50 % entre {formatPricePerM2(stat.p25)} et {formatPricePerM2(stat.p75)}
      </p>
    </div>
  );
}
