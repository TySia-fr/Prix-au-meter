import { NextResponse } from "next/server";
import { areaRefSchema } from "@/lib/validation";
import { areaDetail, trend } from "@/server/queries";
import { HttpError, PUBLIC_CACHE, route } from "@/server/http";

/** Area (IRIS or commune) summary over the reference period + yearly trend (R3). */
export const GET = route(async (_req: Request, ctx: RouteContext<"/api/areas/[level]/[code]">) => {
  const ref = areaRefSchema.parse(await ctx.params);
  const [detail, points] = await Promise.all([areaDetail(ref.level, ref.code), trend(ref.level, ref.code)]);
  if (!detail) throw new HttpError(404, "Zone introuvable");
  return NextResponse.json({ ...detail, trend: points }, { headers: PUBLIC_CACHE });
});
