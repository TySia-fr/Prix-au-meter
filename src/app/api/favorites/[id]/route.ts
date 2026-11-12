import { z } from "zod";
import { removeFavorite, requireUser } from "@/server/favorites";
import { assertSameOrigin, route } from "@/server/http";

export const DELETE = route(async (req: Request, ctx: RouteContext<"/api/favorites/[id]">) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const id = z.uuid().parse((await ctx.params).id);
  await removeFavorite(user.id, id);
  return new Response(null, { status: 204 });
});
