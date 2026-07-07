"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { parseCoordinates } from "@/lib/geo-import";

/** Subset of the Nominatim search response we use. boundingbox is
 *  [south, north, west, east] as strings. */
interface NominatimResult {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
}

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

function shortLabel(r: NominatimResult): string {
  return r.name || r.display_name.split(",")[0];
}

export default function PlaceSearch({
  onGoTo,
}: {
  /** bbox is [west, south, east, north]; center is [lng, lat] */
  onGoTo: (
    bbox: [number, number, number, number],
    center: [number, number],
    label: string,
  ) => void;
}) {
  const t = useTranslations("map");
  const locale = useLocale();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [coord, setCoord] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // debounced geocode (Indonesia only)
  useEffect(() => {
    const q = query.trim();
    // a pasted coordinate short-circuits the place geocode
    const c = parseCoordinates(q);
    setCoord(c);
    if (c) {
      setResults([]);
      setLoading(false);
      setOpen(true);
      return;
    }
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=id&limit=6&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { "Accept-Language": locale === "en" ? "en" : "id" },
        });
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setOpen(true);
      } catch {
        /* aborted or offline, leave previous results */
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [query, locale]);

  // close the dropdown on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const select = (r: NominatimResult) => {
    const [s, n, w, e] = r.boundingbox.map(Number);
    onGoTo([w, s, e, n], [Number(r.lon), Number(r.lat)], r.display_name);
    setQuery(shortLabel(r));
    setResults([]);
    setOpen(false);
  };

  const goToCoord = () => {
    if (!coord) return;
    const [lng, lat] = coord;
    const d = 0.02; // small frame around the point
    onGoTo([lng - d, lat - d, lng + d, lat + d], [lng, lat], `${lat}, ${lng}`);
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
        placeholder={t("searchPlace")}
        aria-label={t("searchPlace")}
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

      {open && (coord || loading || results.length > 0) && (
        <ul className="glass absolute left-0 right-0 top-full z-10 mt-1 max-h-[230px] list-none overflow-y-auto rounded-xl p-1 [scrollbar-width:thin] bg-gray-900">
          {coord ? (
            <li>
              <button
                onClick={goToCoord}
                className="block w-full cursor-pointer appearance-none rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-[0.8rem] text-foreground transition-colors hover:bg-[var(--accent-dim)] hover:text-accent"
              >
                <span className="block font-medium">📍 {t("goToCoord")}</span>
                <span className="block text-[0.72rem] text-muted">
                  {coord[1].toFixed(5)}, {coord[0].toFixed(5)}
                </span>
              </button>
            </li>
          ) : loading && results.length === 0 ? (
            <li className="px-2 py-2 text-[0.8rem] text-muted">
              {t("searching")}
            </li>
          ) : (
            results.map((r) => (
              <li key={r.place_id}>
                <button
                  onClick={() => select(r)}
                  className="block w-full cursor-pointer appearance-none rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-[0.8rem] text-foreground transition-colors hover:bg-[var(--accent-dim)] hover:text-accent"
                >
                  <span className="block font-medium">{shortLabel(r)}</span>
                  <span className="block truncate text-[0.72rem] text-muted">
                    {r.display_name}
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
