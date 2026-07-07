"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { parseBoundaryFile, type ImportResult } from "@/lib/geo-import";

/** Upload a project boundary / AOI (KMZ, KML or DXF) and overlay it on the map,
 *  so users can screenshot the deforestation/concession context under it. */
export default function BoundaryUpload({
  onLoaded,
  loadedName,
  onClear,
}: {
  onLoaded: (result: ImportResult, filename: string) => void;
  loadedName?: string;
  onClear: () => void;
}) {
  const t = useTranslations("map");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const result = await parseBoundaryFile(file);
      if (!result.geojson.features.length)
        throw new Error("no geometry in file");
      onLoaded(result, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("uploadError"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".kmz,.kml"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {loadedName ? (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-[0.7rem] py-[0.42rem] text-[0.8rem]">
          <span className="shrink-0 text-accent">◈</span>
          <span className="flex-1 truncate" title={loadedName}>
            {loadedName}
          </span>
          <button
            onClick={onClear}
            aria-label={t("clearBoundary")}
            title={t("clearBoundary")}
            className="shrink-0 cursor-pointer rounded-md border-0 bg-transparent px-1 text-muted transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-highlight)] px-[0.7rem] py-[0.42rem] text-[0.8rem] text-muted transition-colors hover:border-[var(--text-dim)] hover:text-foreground disabled:opacity-60"
        >
          <span aria-hidden>⬆</span>
          {busy ? t("uploadParsing") : t("uploadBoundary")}
        </button>
      )}
      {error && (
        <p className="mt-1 text-[0.72rem] text-[var(--danger)]">
          {t("uploadError")}: {error}
        </p>
      )}
    </div>
  );
}
