"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useLocale, useTranslations } from "next-intl";
import { API_BASE } from "@/lib/api";

/**
 * Share the current map view. Captures the live viewport (zoom/pitch/bearing +
 * whatever layers are on), composes it at a social-friendly size with a quiet
 * watermark, and shares via the Web Share API — or falls back to copy/download.
 *
 * Tone is a friend sharing a discovery, never marketing. The captions say
 * "look what I found", not "check out our app".
 */

const SIZES = {
  portrait: { w: 1080, h: 1350, key: "sharePortrait" },
  story: { w: 1080, h: 1920, key: "shareStory" },
  wide: { w: 1200, h: 630, key: "shareWide" },
} as const;
type SizeKey = keyof typeof SIZES;

// Context-aware, discovery-tone captions — generated from what the user is
// actually looking at (active layers + a selected species + basemap), so it
// feels like a real person sharing a find, not a template. Always editable.
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

interface CapCtx {
  layers: string[];
  satellite: boolean;
  species?: string;
  locale: string;
}

function pickHook(c: CapCtx): string {
  const has = (x: string) => c.layers.includes(x);
  const sp = c.species?.trim();
  const en = c.locale === "en";

  if (en) {
    if (has("species-dist") || has("endemic") || has("flora"))
      return sp
        ? pick([
            `Didn't realise ${sp} still ranges across this area.`,
            `Turns out ${sp} is still found around here.`,
          ])
        : `Didn't realise how much wildlife still lives in this area.`;
    if (has("fires") && has("peatland"))
      return `Looking at hotspots over peatland — more of them than I expected.`;
    if (has("fires"))
      return `Just looking at hotspots from satellite. More than I thought.`;
    if (has("mangrove"))
      return `Didn't realise Indonesia's mangroves stretched this far.`;
    if (has("peatland"))
      return `Didn't realise how vast Indonesia's peatlands are.`;
    if (has("forestloss"))
      return `Watching how the forest here changed over the years. Makes you think.`;
    if (has("concessions"))
      return `Looking at the concession areas across this region.`;
    if (has("protected"))
      return `Looking at the protected areas around here — bigger than I thought.`;
    if (has("ecoregions") || has("biogeo"))
      return `Reading up on Indonesia's ecoregions — wildly diverse.`;
    return c.satellite
      ? `Exploring Indonesia from above — turns out it's fascinating.`
      : `Ended up exploring the map of Indonesia for way too long.`;
  }

  if (has("species-dist") || has("endemic") || has("flora"))
    return sp
      ? pick([
          `Baru tahu habitat ${sp} masih tersebar di area ini.`,
          `Ternyata ${sp} masih ada di sekitar sini. Nggak nyangka.`,
          `Lagi lihat sebaran ${sp} — ternyata sampai sini juga.`,
        ])
      : pick([
          `Baru sadar ternyata masih banyak satwa yang tinggal di area ini.`,
          `Lagi lihat sebaran satwa di sini — ternyata rame juga.`,
        ]);
  if (has("fires") && has("peatland"))
    return pick([
      `Lagi lihat sebaran hotspot di atas lahan gambut. Ternyata banyak juga yang baru aku tahu.`,
      `Iseng cek titik panas di area gambut — ternyata cukup padat.`,
    ]);
  if (has("fires") && has("mangrove"))
    return `Lihat sebaran hotspot di sekitar mangrove. Menarik buat diperhatiin.`;
  if (has("fires"))
    return pick([
      `Lagi lihat sebaran hotspot dari satelit. Ternyata cukup banyak.`,
      `Iseng cek titik panas belakangan ini. Lumayan bikin melek.`,
    ]);
  if (has("mangrove"))
    return pick([
      `Baru sadar ternyata mangrove di Indonesia seluas ini.`,
      `Lagi lihat sebaran mangrove — ternyata banyak yang belum aku tahu.`,
    ]);
  if (has("peatland"))
    return pick([
      `Baru sadar lahan gambut di Indonesia seluas ini.`,
      `Lagi lihat sebaran gambut — ternyata luas banget.`,
    ]);
  if (has("forestloss"))
    return pick([
      `Lagi lihat perubahan tutupan hutan dari tahun ke tahun. Bikin mikir.`,
      `Iseng lihat gimana tutupan pohon berubah di sini.`,
    ]);
  if (has("concessions"))
    return `Lagi lihat sebaran area konsesi di wilayah ini. Menarik buat diperhatiin.`;
  if (has("protected"))
    return pick([
      `Lagi lihat kawasan lindung di sekitar sini. Ternyata cukup luas juga.`,
      `Baru tahu kawasan lindung di area ini seluas ini.`,
    ]);
  if (has("ecoregions") || has("biogeo"))
    return pick([
      `Lagi belajar soal ekoregion Indonesia — ternyata beragam banget.`,
      `Lihat garis biogeografi Indonesia — ternyata sekeren ini.`,
    ]);
  return c.satellite
    ? pick([
        `Lagi iseng eksplor Indonesia dari atas. Ternyata menarik juga.`,
        `Iseng zoom-zoom citra satelit Indonesia. Banyak yang baru aku tahu.`,
      ])
    : pick([
        `Lagi iseng eksplor peta Indonesia. Ternyata menarik juga kalau diperhatiin.`,
        `Iseng buka peta, malah keasyikan eksplor.`,
      ]);
}

function withLink(hook: string, locale: string): string {
  const cta =
    locale === "en"
      ? pick([
          `If you're curious about your own area, give it a try:`,
          `Have a look at your own area:`,
        ])
      : pick([
          `Kalau penasaran sama daerahmu sendiri, coba aja:`,
          `Cobain eksplor daerahmu sendiri di sini:`,
        ]);
  return `${hook}\n\n${cta}\nhttps://mandumrimba.org`;
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  credit: string,
  logo: HTMLImageElement | null,
) {
  const pad = Math.round(w * 0.045);
  // bottom scrim for legibility
  const sh = Math.min(h * 0.24, 260);
  const g = ctx.createLinearGradient(0, h - sh, 0, h);
  g.addColorStop(0, "rgba(6,12,9,0)");
  g.addColorStop(1, "rgba(6,12,9,0.82)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h - sh, w, sh);

  ctx.textBaseline = "alphabetic";
  // Mandum Rimba logo, bottom-left
  const lh = Math.round(w * 0.055);
  if (logo && logo.naturalWidth) {
    const lw = lh * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, pad, h - pad - lh, lw, lh);
  } else {
    // fallback wordmark if the logo hasn't loaded
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(w * 0.034)}px -apple-system, "Segoe UI", system-ui, sans-serif`;
    ctx.fillText("Mandum Rimba", pad, h - pad - lh * 0.15);
  }

  // site + imagery credit, bottom-right, quiet
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(236,234,224,.72)";
  ctx.font = `600 ${Math.round(w * 0.018)}px ui-monospace, Menlo, monospace`;
  ctx.fillText("mandumrimba.org", w - pad, h - pad - Math.round(w * 0.022));
  ctx.fillStyle = "rgba(236,234,224,.5)";
  ctx.font = `500 ${Math.round(w * 0.014)}px ui-monospace, Menlo, monospace`;
  ctx.fillText(credit, w - pad, h - pad);
  ctx.textAlign = "left";
}

/* ── official brand glyphs (share-button use) ── */
// Threads: use the supplied SVG file as a CSS mask so it renders in
// currentColor (the file's path is solid black, invisible on the dark modal)
const IconThreads = () => (
  <span
    aria-hidden
    className="inline-block h-5 w-5 bg-current"
    style={{
      WebkitMaskImage: "url(/images/Threads_logo.svg)",
      maskImage: "url(/images/Threads_logo.svg)",
      WebkitMaskSize: "contain",
      maskSize: "contain",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskPosition: "center",
    }}
  />
);
const IconX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
const IconFacebook = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2" aria-hidden>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);
const IconInstagram = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <defs>
      <linearGradient id="ig-g" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#feda75" />
        <stop offset=".35" stopColor="#fa7e1e" />
        <stop offset=".6" stopColor="#d62976" />
        <stop offset="1" stopColor="#962fbf" />
      </linearGradient>
    </defs>
    <path fill="url(#ig-g)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
  </svg>
);

export default function ShareModal({
  mapRef,
  basemap,
  layers,
  species,
  onClose,
}: {
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  basemap: "dark" | "satellite";
  layers: string[];
  species?: string;
  onClose: () => void;
}) {
  const t = useTranslations("map");
  const locale = useLocale();
  // pick a contextual hook once (per open) from what's on screen
  const hook = useRef(
    pickHook({ layers, satellite: basemap === "satellite", species, locale }),
  ).current;

  const base = useRef<HTMLCanvasElement | null>(null); // frozen snapshot
  const composed = useRef<HTMLCanvasElement | null>(null); // last full-res render
  const logo = useRef<HTMLImageElement | null>(null); // Mandum Rimba wordmark
  const shareUrls = useRef<Record<string, string>>({}); // uploaded link, by size
  const [size, setSize] = useState<SizeKey>("portrait");
  const [mode, setMode] = useState<"image" | "link">("image");
  const [caption, setCaption] = useState(hook);
  const [preview, setPreview] = useState<string>("");
  const [err, setErr] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const canShareFiles =
    typeof navigator !== "undefined" &&
    !!navigator.canShare &&
    (() => {
      try {
        return navigator.canShare({
          files: [new File([new Blob()], "x.png", { type: "image/png" })],
        });
      } catch {
        return false;
      }
    })();

  // freeze the current viewport once, when the modal opens
  useEffect(() => {
    const mc = mapRef.current?.getCanvas();
    if (!mc) {
      setErr(true);
      return;
    }
    try {
      const b = document.createElement("canvas");
      b.width = mc.width;
      b.height = mc.height;
      b.getContext("2d")!.drawImage(mc, 0, 0);
      // toDataURL throws if the canvas is tainted — probe it early
      b.toDataURL("image/png");
      base.current = b;
    } catch {
      setErr(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const credit =
    basemap === "satellite"
      ? "Imagery © Esri, Maxar, Earthstar Geographics"
      : "© OpenStreetMap contributors © CARTO";

  const render = useCallback(() => {
    const b = base.current;
    if (!b) return;
    const { w, h } = SIZES[size];
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d")!;
    const scale = Math.max(w / b.width, h / b.height);
    const dw = b.width * scale;
    const dh = b.height * scale;
    ctx.drawImage(b, (w - dw) / 2, (h - dh) / 2, dw, dh);
    drawWatermark(ctx, w, h, credit, logo.current);
    composed.current = out;
    setPreview(out.toDataURL("image/png"));
  }, [size, credit]);

  useEffect(() => {
    render();
  }, [render]);

  // load the real Mandum Rimba wordmark (same-origin SVG → won't taint the
  // canvas). Use the dark-bg variant since the export has a dark scrim.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      logo.current = img;
      render();
    };
    // PNG (not SVG): guarantees intrinsic dimensions for a reliable canvas draw
    img.src = "/images/mandum_rimba_dark.png";
  }, [render]);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chooseMode = (m: "image" | "link") => {
    setMode(m);
    setCaption(m === "link" ? withLink(hook, locale) : hook);
  };

  const toBlob = () =>
    new Promise<Blob | null>((res) =>
      composed.current
        ? composed.current.toBlob((b) => res(b), "image/png")
        : res(null),
    );
  const ping = (k: string) => {
    setFlash(k);
    setTimeout(() => setFlash(null), 1600);
  };

  const doShare = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], "mandum-rimba.png", { type: "image/png" });
    try {
      await navigator.share({ files: [file], text: caption });
    } catch {
      /* user cancelled — no-op */
    }
  };
  const copyImage = async () => {
    const blob = await toBlob();
    if (!blob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      ping("img");
    } catch {
      ping("imgfail");
    }
  };
  const download = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mandum-rimba-${size}.png`;
    a.click();
    URL.revokeObjectURL(url);
    ping("dl");
  };
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      ping("txt");
    } catch {
      /* ignore */
    }
  };

  const SITE = "https://mandumrimba.org";
  const openWin = (u: string) =>
    window.open(u, "_blank", "noopener,noreferrer");
  const copyImageQuiet = async () => {
    const blob = await toBlob();
    if (!blob) return false;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      return true;
    } catch {
      return false;
    }
  };
  // upload the composed PNG once (per size) so it can be unfurled as an OG
  // image; returns a share-page URL whose preview IS the map, or null on failure
  const getShareUrl = async (): Promise<string | null> => {
    if (shareUrls.current[size]) return shareUrls.current[size];
    const dataUrl = composed.current?.toDataURL("image/png");
    if (!dataUrl) return null;
    try {
      const r = await fetch(`${API_BASE}/v1/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!r.ok) return null;
      const { id } = (await r.json()) as { id: string };
      const url = `${SITE}/s/${id}`;
      shareUrls.current[size] = url;
      return url;
    } catch {
      return null;
    }
  };

  // Per-platform. X/Threads/Facebook can't take an image attachment from the
  // web, so we share a link whose OG image IS the map — it unfurls with the
  // picture. Instagram has no web intent: native sheet (image) on mobile, else
  // download to upload.
  const toPlatform = async (p: "x" | "threads" | "facebook" | "instagram") => {
    if (p === "instagram") {
      if (canShareFiles) await doShare();
      else {
        await download();
        ping("ig");
      }
      return;
    }
    // reserve the popup synchronously (avoids blockers), navigate after upload
    const win = window.open("about:blank", "_blank");
    const link = (await getShareUrl()) ?? SITE;
    if (p === "facebook") {
      const u = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
      if (win) win.location.href = u;
      else openWin(u);
      return;
    }
    // X / Threads: put the (unfurling) link in the text; also copy the PNG as a
    // manual-paste backup
    void copyImageQuiet().then((ok) => ok && ping("img"));
    const text = caption.includes("mandumrimba.org")
      ? caption.replace(/https?:\/\/\S*mandumrimba\.org\S*/g, link)
      : `${caption}\n\n${link}`;
    const intent =
      p === "x"
        ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
        : `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`;
    if (win) win.location.href = intent;
    else openWin(intent);
  };

  const chip =
    "cursor-pointer rounded-full border px-3 py-1 text-[0.78rem] transition-colors";
  const ghost =
    "flex items-center justify-center gap-1.5 cursor-pointer rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-2 py-2 text-[0.78rem] text-foreground transition-colors hover:border-[var(--text-dim)]";
  const platBtn =
    "flex flex-col items-center gap-1.5 cursor-pointer rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] py-2.5 text-[0.62rem] text-muted transition-colors hover:border-[var(--text-dim)] hover:text-foreground";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("shareTitle")}
    >
      <div
        className="glass flex max-h-[80vh] w-full max-w-[440px] flex-col overflow-hidden rounded-[20px] mt-16"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--glass-border)] px-4 py-3">
          <h2 className="m-0 text-[0.98rem]">{t("shareTitle")}</h2>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="cursor-pointer rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-2.5 py-1 text-[0.78rem] text-muted transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:thin]">
          {err ? (
            <p className="py-8 text-center text-[0.85rem] text-muted">
              {t("shareError")}
            </p>
          ) : (
            <>
              {/* preview */}
              <div className="mb-3 flex justify-center rounded-xl bg-black/30 p-2">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt={t("shareTitle")}
                    className="max-h-[42vh] w-auto max-w-full rounded-lg"
                  />
                ) : (
                  <div className="h-40 w-full animate-pulse rounded-lg bg-white/5" />
                )}
              </div>

              {/* size */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(Object.keys(SIZES) as SizeKey[]).map((k) => {
                  const on = size === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setSize(k)}
                      className={`${chip} ${
                        on
                          ? "border-accent bg-[var(--accent-dim)] text-accent"
                          : "border-[var(--glass-border)] text-muted hover:text-foreground"
                      }`}
                    >
                      {t(SIZES[k].key)}
                    </button>
                  );
                })}
              </div>

              {/* option A / B */}
              <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--glass-highlight)] p-1">
                {(["image", "link"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => chooseMode(m)}
                    className={`cursor-pointer rounded-lg px-2 py-1.5 text-[0.8rem] transition-colors ${
                      mode === m
                        ? "bg-[var(--accent-dim)] text-accent"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {t(m === "image" ? "shareOptImage" : "shareOptLink")}
                  </button>
                ))}
              </div>

              {/* caption */}
              <label className="mb-1 block text-[0.7rem] uppercase tracking-[0.05em] text-muted">
                {t("shareCaption")}
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={mode === "link" ? 5 : 3}
                className="w-full resize-none rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-3 py-2 text-[0.84rem] leading-snug text-foreground outline-none transition-colors focus:border-accent"
              />
            </>
          )}
        </div>

        {!err && (
          <footer className="flex shrink-0 flex-col gap-2.5 border-t border-[var(--glass-border)] px-4 py-3">
            {canShareFiles && (
              <button
                onClick={doShare}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-[0.9rem] font-medium text-[#08130d] transition-[filter] hover:brightness-105"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3m0 0-4 4m4-4 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t("shareNative")}
              </button>
            )}
            {/* platform targets — official icons */}
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => toPlatform("threads")} className={platBtn} aria-label="Threads">
                <IconThreads />
                Threads
              </button>
              <button onClick={() => toPlatform("instagram")} className={platBtn} aria-label="Instagram">
                <IconInstagram />
                Instagram
              </button>
              <button onClick={() => toPlatform("x")} className={platBtn} aria-label="X">
                <IconX />
                X
              </button>
              <button onClick={() => toPlatform("facebook")} className={platBtn} aria-label="Facebook">
                <IconFacebook />
                Facebook
              </button>
            </div>
            <p className="text-[0.64rem] leading-snug text-muted">{t("shareHint")}</p>
            {/* utilities */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={copyImage} className={ghost}>
                {flash === "img" ? t("shareCopied") : t("shareCopyImage")}
              </button>
              <button onClick={download} className={ghost}>
                {flash === "dl" || flash === "ig" ? t("shareCopied") : t("shareDownload")}
              </button>
              <button onClick={copyText} className={ghost}>
                {flash === "txt" ? t("shareCopied") : t("shareCopyText")}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
