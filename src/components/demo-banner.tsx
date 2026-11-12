export function DemoBanner({ source }: { source: "dvf" | "synthetic" | null }) {
  if (source === "dvf") return null;
  return (
    <div role="note" className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-center text-xs text-warn">
      {source === "synthetic"
        ? "Données de démonstration synthétiques (structure DVF) — ne reflètent pas le marché réel. Lancez « pnpm data:import » pour charger les données officielles."
        : "Aucune donnée importée. Lancez « pnpm data:import --dept 34 »."}
    </div>
  );
}
