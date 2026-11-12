import { NextResponse, type NextRequest } from "next/server";
import { bboxSchema } from "@/lib/validation";
import { communesInBbox, streetsInBbox } from "@/server/queries";
import { PUBLIC_CACHE, route } from "@/server/http";

/** GeoJSON for the current viewport: streets (zoom ≥ 13) or communes. */
export const GET = route(async (req: NextRequest) => {
  const bbox = bboxSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const items = bbox.layer === "streets" ? await streetsInBbox(bbox) : await communesInBbox(bbox);
  return NextResponse.json(
    {
      type: "FeatureCollection",
      features: items.map(({ lon, lat, ...properties }) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties,
      })),
    },
    { headers: PUBLIC_CACHE },
  );
});
