"use client";
import { useState } from "react";
import Link from "next/link";

interface Fav { id: string; irisCode: string; name: string; communeName: string }

export function FavoritesList({ initial }: { initial: Fav[] }) {
  const [items, setItems] = useState(initial);
  const [msg, setMsg] = useState("");
  if (items.length === 0) {
    return <p className="mt-6 text-sm text-muted">Aucun favori pour l&apos;instant. Sélectionnez un quartier sur la <Link href="/" className="text-accent hover:underline">carte</Link> pour l&apos;enregistrer.</p>;
  }
  return (
    <>
      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface" data-testid="favorites">
        {items.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 p-4 animate-fade-in">
            <Link href={`/?zone=iris:${f.irisCode}`} className="hover:text-accent">
              <span className="font-medium">{f.name}</span> <span className="text-sm text-muted">· {f.communeName}</span>
            </Link>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-danger"
              aria-label={`Retirer ${f.name} des favoris`}
              onClick={async () => {
                const r = await fetch(`/api/favorites/${f.id}`, { method: "DELETE" });
                if (r.ok) { setItems((xs) => xs.filter((x) => x.id !== f.id)); setMsg(`${f.name} retiré des favoris`); }
              }}
            >
              Retirer
            </button>
          </li>
        ))}
      </ul>
      <p role="status" className="sr-only">{msg}</p>
    </>
  );
}
