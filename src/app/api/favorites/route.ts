import { NextResponse } from "next/server";
import { favoriteBodySchema } from "@/lib/validation";
import { addFavorite, listFavorites, requireUser } from "@/server/favorites";
import { assertSameOrigin, HttpError, route } from "@/server/http";

const PRIVATE = { "Cache-Control": "private, no-store" };

export const GET = route(async () => {
  const user = await requireUser();
  return NextResponse.json({ favorites: await listFavorites(user.id) }, { headers: PRIVATE });
});

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = favoriteBodySchema.parse(await req.json().catch(() => { throw new HttpError(400, "JSON invalide"); }));
  return NextResponse.json(await addFavorite(user.id, body.irisCode), { status: 201, headers: PRIVATE });
});
