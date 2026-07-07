"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { searchSpecies, type SpeciesHit } from "@/lib/species";

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M20 20l-3.2-3.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

/** Autocomplete over the self-hosted /species API. Picking a species tells the
 *  map to show WHERE it lives (records + range outline). */
export default function SpeciesSearch({
  onSelect,
  selectedLabel,
}: {
  onSelect: (key: number, label: string) => void;
  selectedLabel?: string;
}) {
  const t = useTranslations("map");
  const [query, setQuery] = useState(selectedLabel ?? "");
  const [results, setResults] = useState<SpeciesHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let active = true;
    const id = setTimeout(async () => {
      try {
        const data = await searchSpecies(q, "Plantae");
        if (!active) return;
        setResults(data);
        setOpen(true);
      } catch {
        /* offline */
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (r: SpeciesHit) => {
    onSelect(r.key, r.canonical || r.sci);
    setQuery(r.canonical || r.sci);
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative shrink-0">
      <span className="pointer-events-none absolute left-[0.7rem] top-1/2 -translate-y-1/2 text-muted">
        <SearchIcon />
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={t("searchSpecies")}
        aria-label={t("searchSpecies")}
        className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] py-[0.42rem] pl-[2.1rem] pr-[1.9rem] text-[0.82rem] text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
      />
      {query && (
        <button
          onClick={() => {
            setQuery("");
            setResults([]);
            setOpen(false);
          }}
          aria-label="Clear"
          className="absolute right-[0.5rem] top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-pointer appearance-none items-center justify-center rounded-md border-0 bg-transparent text-[0.7rem] text-muted transition-colors hover:bg-[var(--accent-dim)] hover:text-foreground"
        >
          ✕
        </button>
      )}

      {open && (loading || results.length > 0) && (
        <ul className="glass absolute left-0 right-0 top-full z-10 mt-1 max-h-[260px] list-none overflow-y-auto rounded-xl p-1 [scrollbar-width:thin] bg-gray-900">
          {loading && results.length === 0 ? (
            <li className="px-2 py-2 text-[0.8rem] text-muted">
              {t("searching")}
            </li>
          ) : (
            results.map((r) => (
              <li key={r.key}>
                <button
                  onClick={() => pick(r)}
                  className="block w-full cursor-pointer appearance-none rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-[0.8rem] text-foreground transition-colors hover:bg-[var(--accent-dim)] hover:text-accent"
                >
                  <span className="block font-medium">
                    {r.canonical || r.sci}
                    {r.vernacular ? ` — ${r.vernacular}` : ""}
                  </span>
                  <span className="block truncate text-[0.72rem] text-muted">
                    {r.family}
                    {r.recordCount ? ` · ${r.recordCount} rec` : ""}
                    {r.iucn ? ` · ${r.iucn}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
