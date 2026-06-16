"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  nearestWildlife,
  nearestConservation,
  comparisonCity,
  fmtKm,
  type NearestResult,
  type NearestConservation,
  type CityComparison,
} from "@/lib/proximity";
import {
  drawCampaignCard,
  canvasToBlob,
  DEFAULT_CROP,
  type CardContent,
  type Crop,
} from "@/lib/campaign-card";
import PhotoCropper from "./PhotoCropper";

interface Place {
  lng: number;
  lat: number;
  label: string;
}
interface NominatimResult {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
}

// `appearance-none` + no native border/bg — Preflight is off, so every button
// must reset the browser's default chrome itself.
const btn =
  "inline-flex cursor-pointer appearance-none items-center justify-center gap-2 rounded-xl px-4 py-3 text-[0.92rem] font-medium transition hover:no-underline disabled:opacity-50";
const btnPrimary = `${btn} bg-accent text-background hover:brightness-110`;
const btnGhost = `${btn} glass text-foreground hover:brightness-[1.04]`;

export default function CampaignTool() {
  const t = useTranslations("campaign");
  // shared category / status labels (Taman Nasional, Cagar Alam, Kritis (CR), …)
  const tm = useTranslations("map");
  const locale = useLocale();

  // ── city search (manual, no GPS) ──
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  // set true when we fill the input from a picked city, so the debounce effect
  // below skips that one query change (otherwise the dropdown reopens).
  const justSelected = useRef(false);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=id&limit=6&q=${encodeURIComponent(q)}`,
          {
            signal: ctrl.signal,
            headers: { "Accept-Language": locale === "en" ? "en" : "id" },
          },
        );
        setResults((await res.json()) as NominatimResult[]);
        setOpen(true);
      } catch {
        /* ignore */
      }
    }, 350);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [query, locale]);

  // ── card state ──
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setTheme(
      document.documentElement.dataset.theme === "light" ? "light" : "dark",
    );
  }, []);

  const nearest: NearestResult | null = place
    ? nearestWildlife(place.lng, place.lat)
    : null;
  const comparison: CityComparison | null =
    place && nearest
      ? comparisonCity(place.lng, place.lat, nearest.distanceKm)
      : null;
  const conservation: NearestConservation | null = place
    ? nearestConservation(place.lng, place.lat)
    : null;

  const content: CardContent | null =
    place && nearest
      ? {
          eyebrow: t("cardEyebrow"),
          species: nearest.species.id,
          sci: nearest.species.sci,
          // full IUCN label so the card reads "Kritis (CR)", not bare "CR"
          iucn: tm(`filterValues.${nearest.species.iucn}`),
          distance: t("cardDistance", { km: fmtKm(nearest.distanceKm) }),
          comparison: comparison
            ? t("comparison", { city: comparison.name, km: fmtKm(comparison.km) })
            : null,
          conservation: conservation
            ? t("cardConservation", {
                // prepend the area category (Taman Nasional, Cagar Alam, …) so
                // it's clear what kind of protected area it is
                name: `${tm(`filterValues.${conservation.category}`)} ${conservation.name}`,
                km: fmtKm(conservation.distanceKm),
              })
            : null,
          location: t("cardLocation", { place: place.label }),
          footer: "",
        }
      : null;

  useEffect(() => {
    if (canvasRef.current && content) {
      void drawCampaignCard(canvasRef.current, theme, content, photo, crop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, theme, photo, crop, locale]);

  const selectPlace = (r: NominatimResult) => {
    const short = r.name || r.display_name.split(",")[0];
    justSelected.current = true;
    setPlace({ lng: Number(r.lon), lat: Number(r.lat), label: short });
    setQuery(short);
    setResults([]);
    setOpen(false);
  };

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setCrop(DEFAULT_CROP);
      setPhoto(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const filename = "yang-tinggal-di-dekatku-mandum-rimba.png";

  const withBlob = useCallback(async (fn: (b: Blob) => void | Promise<void>) => {
    if (!canvasRef.current) return;
    setBusy(true);
    try {
      const blob = await canvasToBlob(canvasRef.current);
      await fn(blob);
    } finally {
      setBusy(false);
    }
  }, []);

  const download = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareNative = () =>
    withBlob(async (blob) => {
      const file = new File([blob], filename, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({
          files: [file],
          title: t("title"),
          text: content ? `${content.species} — ${content.distance}` : t("title"),
        });
      } else {
        download(blob);
      }
    });

  const shareText = content
    ? `${content.species} — ${content.distance} ${t("shareTagline")}`
    : t("title");
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const links = {
    wa: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${pageUrl}`)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`,
    fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(shareText)}`,
    th: `https://www.threads.net/intent/post?text=${encodeURIComponent(`${shareText} ${pageUrl}`)}`,
  };

  return (
    <div>
      {/* Step 1 — city search */}
      <div className="max-w-[560px]">
        <label className="mb-1.5 block text-[0.85rem] font-medium text-muted">
          {t("locationLabel")}
        </label>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={t("locationPlaceholder")}
            className="w-full appearance-none rounded-xl border border-border bg-surface px-4 py-3 text-[0.95rem] text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
          />
          {open && results.length > 0 && (
            <ul className="glass absolute left-0 right-0 top-full z-10 mt-1 max-h-[260px] list-none overflow-y-auto rounded-xl p-1 [scrollbar-width:thin]">
              {results.map((r) => (
                <li key={r.place_id}>
                  <button
                    onClick={() => selectPlace(r)}
                    className="block w-full cursor-pointer appearance-none rounded-lg border-0 bg-transparent px-3 py-2 text-left text-[0.9rem] text-foreground transition-colors hover:bg-[var(--accent-dim)] hover:text-accent"
                  >
                    <span className="block font-medium">
                      {r.name || r.display_name.split(",")[0]}
                    </span>
                    <span className="block truncate text-[0.75rem] text-muted">
                      {r.display_name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-1.5 text-[0.78rem] text-muted">{t("privacyLoc")}</p>
      </div>

      {place && nearest && (
        <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
          {/* Preview — first on mobile, sticky right on desktop */}
          <div className="order-1 md:order-2 md:w-[320px] md:shrink-0 md:sticky md:top-[6rem]">
            <div className="mx-auto w-[250px] overflow-hidden rounded-2xl border border-border shadow-[var(--shadow)] sm:w-[280px] md:w-[300px]">
              <canvas
                ref={canvasRef}
                className="block w-full"
                style={{ aspectRatio: "9 / 16" }}
              />
            </div>
          </div>

          {/* Controls — after preview on mobile, left on desktop */}
          <div className="order-2 flex flex-1 flex-col gap-6 md:order-1">
            {/* summary */}
            <div className="glass rounded-2xl p-5">
              <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-accent">
                {t("cardEyebrow")}
              </p>
              <p className="m-0 mt-1 text-[1.35rem] font-bold leading-tight text-foreground">
                {nearest.species.id}
              </p>
              <p className="m-0 mt-2 text-[0.95rem] leading-relaxed text-muted">
                {content?.distance}
                {content?.comparison ? ` ${content.comparison}` : ""}
              </p>
              {content?.conservation && (
                <p className="m-0 mt-2 text-[0.9rem] font-medium text-accent">
                  {content.conservation}
                </p>
              )}
            </div>

            {/* theme + photo */}
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-xl border border-border p-1">
                  {(["dark", "light"] as const).map((th) => (
                    <button
                      key={th}
                      onClick={() => setTheme(th)}
                      className={`cursor-pointer appearance-none rounded-lg border-0 px-3.5 py-1.5 text-[0.85rem] transition-colors ${
                        theme === th
                          ? "bg-[var(--accent-dim)] text-accent"
                          : "bg-transparent text-muted hover:text-foreground"
                      }`}
                    >
                      {t(th === "dark" ? "themeDark" : "themeLight")}
                    </button>
                  ))}
                </div>
                <label className={btnGhost}>
                  {photo ? t("changePhoto") : t("addPhoto")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPhoto}
                  />
                </label>
                {photo && (
                  <button onClick={() => setPhoto(null)} className={btnGhost}>
                    {t("removePhoto")}
                  </button>
                )}
              </div>
              {photo && (
                <div className="mt-4">
                  <PhotoCropper
                    photo={photo}
                    crop={crop}
                    onChange={setCrop}
                    hint={t("cropHint")}
                    zoomLabel={t("cropZoom")}
                  />
                </div>
              )}
              <p className="mt-2 text-[0.78rem] text-muted">{t("privacyPhoto")}</p>
            </div>

            {/* share */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  className={`${btnPrimary} w-full`}
                  onClick={shareNative}
                  disabled={busy}
                >
                  {t("share")}
                </button>
                <button
                  className={`${btnGhost} w-full`}
                  onClick={() => withBlob(download)}
                  disabled={busy}
                >
                  {t("download")}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <a className={`${btnGhost} w-full`} href={links.wa} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
                <a className={`${btnGhost} w-full`} href={links.th} target="_blank" rel="noreferrer">
                  Threads
                </a>
                <a className={`${btnGhost} w-full`} href={links.x} target="_blank" rel="noreferrer">
                  X
                </a>
                <a className={`${btnGhost} w-full`} href={links.fb} target="_blank" rel="noreferrer">
                  Facebook
                </a>
              </div>
              <p className="text-[0.78rem] text-muted">{t("shareHint")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
