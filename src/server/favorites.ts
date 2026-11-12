import "server-only";
import { getPrisma } from "./prisma";
import { HttpError } from "./http";
import { getSessionUser } from "./auth";

/**
 * Access control (R5/A7): the user id ALWAYS comes from the server-side
 * session, never from the request. Every query is scoped by user_id, so a
 * user can neither list nor delete another user's favourites (a foreign id
 * yields 404, indistinguishable from a non-existent one — no enumeration).
 */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Authentification requise");
  return user;
}

export async function listFavorites(userId: string) {
  const rows = await getPrisma().favorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, irisCode: true, createdAt: true, iris: { select: { name: true, commune: { select: { name: true } } } } },
  });
  return rows.map((f) => ({ id: f.id, irisCode: f.irisCode, name: f.iris.name, communeName: f.iris.commune.name, createdAt: f.createdAt }));
}

export async function addFavorite(userId: string, irisCode: string) {
  const prisma = getPrisma();
  const exists = await prisma.iris.findUnique({ where: { code: irisCode }, select: { code: true } });
  if (!exists) throw new HttpError(404, "Quartier introuvable");
  return prisma.favorite.upsert({
    where: { userId_irisCode: { userId, irisCode } },
    create: { userId, irisCode },
    update: {},
    select: { id: true, irisCode: true },
  });
}

export async function removeFavorite(userId: string, id: string) {
  const { count } = await getPrisma().favorite.deleteMany({ where: { id, userId } });
  if (count === 0) throw new HttpError(404, "Favori introuvable");
}
