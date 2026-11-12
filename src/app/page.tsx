import { Suspense } from "react";
import { Explorer } from "@/components/explorer";
import { DemoBanner } from "@/components/demo-banner";
import { datasetInfo } from "@/server/queries";
import { getSessionUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [info, user] = await Promise.all([datasetInfo(), getSessionUser()]);
  return (
    <>
      <h1 className="sr-only">Carte des prix immobiliers au m²</h1>
      <DemoBanner source={info.source} />
      <Suspense>
        <Explorer period={info} signedIn={user != null} />
      </Suspense>
    </>
  );
}
