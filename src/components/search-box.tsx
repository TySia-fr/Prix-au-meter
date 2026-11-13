"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { SearchHit } from "@/lib/types";

/** Accessible combobox (WAI-ARIA 1.2 pattern): arrow keys, Enter, Escape. */
export function SearchBox({ onSelect, label = "Rechercher une ville ou un quartier", id }: { onSelect: (hit: SearchHit) => void; label?: string; id?: string }) {
  const autoId = useId();
  const inputId = id ?? `search-${autoId}`;
  const listId = `${inputId}-list`;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = (abort.current = new AbortController());
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        const { results } = (await res.json()) as { results: SearchHit[] };
        setHits(results);
        setOpen(true);
        setActive(-1);
        setStatus(results.length ? `${results.length} résultat${results.length > 1 ? "s" : ""}` : "Aucun résultat");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("La recherche a échoué");
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const choose = (h: SearchHit) => {
    setQ(h.name);
    setOpen(false);
    onSelect(h);
  };

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{label}</label>
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={open && hits.length > 0 ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Montpellier, Antigone…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < 2) {
            setHits([]);
            setOpen(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && hits[active >= 0 ? active : 0]) { e.preventDefault(); choose(hits[active >= 0 ? active : 0]!); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
      />
      <div role="status" aria-live="polite" className="sr-only">{status}</div>
      {open && hits.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Résultats" className="absolute z-20 mt-1 max-h-72 w-full animate-fade-in overflow-auto rounded-lg border border-border bg-surface-2 py-1 shadow-xl">
          {hits.map((h, i) => (
            <li
              key={`${h.level}:${h.code}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(h); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm ${i === active ? "bg-accent/15" : ""}`}
            >
              <span>{h.name}{h.communeName && <span className="text-muted"> · {h.communeName}</span>}</span>
              <span className="shrink-0 text-xs text-muted">{h.level === "iris" ? "Quartier" : "Commune"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
