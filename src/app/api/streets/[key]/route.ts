import { NextResponse } from "next/server";
import { streetKeySchema } from "@/lib/validation";
import { streetDetail } from "@/server/queries";
import { HttpError, PUBLIC_CACHE, route } from "@/server/http";

export const GET = route(async (_req: Request, ctx: RouteContext<"/api/streets/[key]">) => {
  const key = streetKeySchema.parse(decodeURIComponent((await ctx.params).key));
  const street = await streetDetail(key);
  if (!street) throw new HttpError(404, "Rue introuvable");
  return NextResponse.json(street, { headers: PUBLIC_CACHE });
});
