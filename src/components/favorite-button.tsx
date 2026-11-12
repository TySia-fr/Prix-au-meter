"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export function FavoriteButton({ irisCode, signedIn }: { irisCode: string; signedIn: boolean }) {
  const [favId, setFavId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/favorites")
      .then((r) => (r.ok ? r.json() : { favorites: [] }))
      .then(({ favorites }: { favorites: { id: string; irisCode: string }[] }) => setFavId(favorites.find((f) => f.irisCode === irisCode)?.id ?? null));
  }, [irisCode, signedIn]);

  if (!signedIn) {
    return <Link href="/connexion" className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-fg">☆ Se connecter pour enregistrer</Link>;
  }

  const toggle = async () => {
    setBusy(true);
    try {
      if (favId) {
        const r = await fetch(`/api/favorites/${favId}`, { method: "DELETE" });
        if (r.ok) { setFavId(null); setMsg("Retiré des favoris"); }
      } else {
        const r = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ irisCode }) });
        if (r.ok) { setFavId(((await r.json()) as { id: string }).id); setMsg("Ajouté aux favoris"); }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={favId != null}
        className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs transition active:scale-95 disabled:opacity-50 ${favId ? "border-warn/60 bg-warn/10 text-warn" : "border-border text-muted hover:text-fg"}`}
      >
        {favId ? "★ Favori" : "☆ Ajouter aux favoris"}
      </button>
      <span role="status" className="sr-only">{msg}</span>
    </>
  );
}
