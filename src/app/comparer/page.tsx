import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareView } from "@/components/compare-view";

export const metadata: Metadata = { title: "Comparer deux quartiers" };

export default function ComparePage() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Comparer deux quartiers</h1>
      <p className="mt-1 text-sm text-muted">Prix médian au m² sur la période de référence et évolution annuelle.</p>
      <Suspense>
        <CompareView />
      </Suspense>
    </div>
  );
}
