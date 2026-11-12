import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { listFavorites } from "@/server/favorites";
import { FavoritesList } from "@/components/favorites-list";

export const metadata: Metadata = { title: "Mes quartiers favoris" };
export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion?next=/favoris");
  const favorites = await listFavorites(user.id);
  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Mes quartiers favoris</h1>
      <FavoritesList initial={favorites.map((f) => ({ id: f.id, irisCode: f.irisCode, name: f.name, communeName: f.communeName }))} />
    </div>
  );
}
