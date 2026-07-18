"use client";

import { useTranslations } from "next-intl";
import { LOSS_STOPS, shortHa } from "@/lib/forest-loss";

/**
 * Bottom-center timeline for the forest-loss choropleth. Scrub or press play to
 * watch each province shade by the hectares of tree cover lost that year. Purely
 * presentational: MapView owns the year index, play state, and the map paint.
 */
export default function ForestLossTimeline({
  years,
  idx,
  onIdx,
  playing,
  onPlayToggle,
  totalHa,
  loading,
  unavailable,
}: {
  years: number[];
  idx: number;
  onIdx: (i: number) => void;
  playing: boolean;
  onPlayToggle: () => void;
  totalHa: number;
  loading: boolean;
  unavailable: boolean;
}) {
  const t = useTranslations("map");
  const year = years[idx];
  const last = years.length - 1;

  return (
    <div
      className="glass absolute bottom-6 left-1/2 z-[5] w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 animate-[panel-in_0.22s_ease] rounded-[18px] p-3.5 max-[720px]:bottom-3 max-[720px]:p-3"
      aria-label={t("lossTimelineTitle")}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[0.72rem] uppercase tracking-[0.05em] text-muted">
            {t("lossTimelineTitle")}
          </p>
          {loading ? (
            <p className="m-0 text-[0.9rem] text-muted">{t("loading")}</p>
          ) : unavailable ? (
            <p className="m-0 text-[0.9rem] text-muted">
              {t("lossUnavailable")}
            </p>
          ) : (
            <p className="m-0 leading-tight">
              <span className="text-[1.35rem] font-semibold tabular-nums">
                {year}
              </span>{" "}
              <span className="text-[0.82rem] text-muted">
                · {Math.round(totalHa).toLocaleString("id-ID")} ha{" "}
                {t("lossLostThisYear")}
              </span>
            </p>
          )}
        </div>
        <button
          onClick={onPlayToggle}
          disabled={loading || years.length === 0}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] text-foreground transition-colors hover:border-[var(--text-dim)] disabled:cursor-default disabled:opacity-40"
          aria-label={playing ? t("pause") : t("play")}
          title={playing ? t("pause") : t("play")}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="1.5" width="3" height="9" rx="1" />
              <rect x="7" y="1.5" width="3" height="9" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2.5 1.6v8.8a.6.6 0 0 0 .92.5l7-4.4a.6.6 0 0 0 0-1l-7-4.4a.6.6 0 0 0-.92.5Z" />
            </svg>
          )}
        </button>
      </div>

      {!unavailable && (
        <>
          <input
            type="range"
            min={0}
            max={Math.max(last, 0)}
            step={1}
            value={idx}
            disabled={loading || years.length === 0}
            onChange={(e) => onIdx(Number(e.target.value))}
            aria-label={t("lossTimelineTitle")}
            className="w-full cursor-pointer accent-[#ff5722] disabled:opacity-40"
          />
          {years.length > 0 && (
            <div className="mt-0.5 flex justify-between text-[0.68rem] tabular-nums text-muted">
              <span>{years[0]}</span>
              <span>{years[last]}</span>
            </div>
          )}

          {/* legend: the same ramp the map uses */}
          <div className="mt-2 flex items-center gap-1.5 text-[0.64rem] text-muted">
            <span className="shrink-0">{t("lossLegendLess")}</span>
            <span className="flex h-2.5 flex-1 overflow-hidden rounded-full">
              {LOSS_STOPS.map(([, color]) => (
                <span
                  key={color}
                  className="flex-1"
                  style={{ background: color }}
                />
              ))}
            </span>
            <span className="shrink-0">
              {shortHa(LOSS_STOPS[LOSS_STOPS.length - 1][0])}+ ha
            </span>
          </div>
        </>
      )}
    </div>
  );
}
