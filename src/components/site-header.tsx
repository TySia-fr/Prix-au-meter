import Link from "next/link";
import { getSessionUser } from "@/server/auth";
import { SignOutButton } from "./sign-out-button";

export async function SiteHeader() {
  const user = await getSessionUser();
  const link = "rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg";
  return (
    <header className="flex items-center gap-2 border-b border-border bg-surface/80 px-4 py-2 backdrop-blur">
      <Link href="/" className="mr-4 flex items-center gap-2 font-semibold tracking-tight">
        <span aria-hidden className="grid size-7 place-items-center rounded-md bg-accent text-xs font-bold text-accent-fg">m²</span>
        Prix au mètre
      </Link>
      <nav aria-label="Navigation principale" className="flex items-center gap-1">
        <Link href="/" className={link}>Carte</Link>
        <Link href="/comparer" className={link}>Comparer</Link>
        <Link href="/favoris" className={link}>Favoris</Link>
      </nav>
      <div className="ml-auto flex items-center gap-2 text-sm">
        {user ? (
          <>
            <span className="hidden text-muted sm:inline" data-testid="user-email">{user.email}</span>
            <SignOutButton />
          </>
        ) : (
          <>
            <Link href="/connexion" className={link}>Connexion</Link>
            <Link href="/inscription" className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg transition hover:brightness-110">
              Créer un compte
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
