"use client";

import { useTranslations } from "next-intl";
import { LOSS_CANOPY, LOSS_RAMP } from "@/lib/forest-loss";

/**
 * Timeline for the GFW tree-cover-loss raster. Scrub or press play to reveal
 * loss cumulatively from 2001 up to the chosen year (like GFW's own map). On
 * desktop it floats bottom-centre; on mobile it sits just ABOVE the peeking
 * layer sheet (22dvh) so the sheet never covers it, and MapView hides it while
 * the sheet is dragged full. Purely presentational.
 */
export default function ForestLossTimeline({
  years,
  idx,
  onIdx,
  playing,
  onPlayToggle,
  mobile = false,
}: {
  years: number[];
  idx: number;
  onIdx: (i: number) => void;
  playing: boolean;
  onPlayToggle: () => void;
  mobile?: boolean;
}) {
  const t = useTranslations("map");
  const year = years[idx];
  const last = years.length - 1;

  const rampGradient = `linear-gradient(to right, ${LOSS_RAMP.map(
    ([pos, hex]) => `${hex} ${Math.round(pos * 100)}%`,
  ).join(", ")})`;
  // how much of the track is "filled" (2001 → chosen year): the density ramp
  // shows up to the thumb, then hard-cuts to transparent (so the rest of the
  // track is see-through, not a grey bar)
  const fillPct = last > 0 ? (idx / last) * 100 : 100;
  const filledRamp = LOSS_RAMP.map(
    ([pos, hex]) => `${hex} ${(pos * fillPct).toFixed(2)}%`,
  ).join(", ");
  const trackBg = `linear-gradient(to right, ${filledRamp}, transparent ${fillPct.toFixed(2)}%)`;

  return (
    <div
      className={`glass absolute left-1/2 z-[5] -translate-x-1/2 animate-[rise-in_0.24s_ease] rounded-[18px] ${
        mobile
          ? "w-[calc(100%-1rem)] p-3"
          : "bottom-6 w-[min(560px,calc(100%-1.5rem))] p-3.5"
      }`}
      // on mobile, ride just above the peeking sheet (SHEET peek = 22dvh)
      style={mobile ? { bottom: "calc(22dvh + 0.6rem)" } : undefined}
      aria-label={t("lossTimelineTitle")}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 truncate text-[0.72rem] uppercase tracking-[0.05em] text-muted">
            {t("lossTimelineTitle")}
          </p>
          <p className="m-0 leading-tight">
            <span className="text-[0.78rem] text-muted">
              {t("lossThrough")}{" "}
            </span>
            <span className="text-[1.3rem] font-semibold tabular-nums">
              {year}
            </span>
          </p>
        </div>
        <button
          onClick={onPlayToggle}
          disabled={years.length === 0}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] text-foreground transition-colors hover:border-[var(--text-dim)] disabled:cursor-default disabled:opacity-40"
          aria-label={playing ? t("pause") : t("play")}
          title={playing ? t("pause") : t("play")}
        >
          {playing ? (
            <svg width="15" height="15" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="1.5" width="3" height="9" rx="1" />
              <rect x="7" y="1.5" width="3" height="9" rx="1" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2.5 1.6v8.8a.6.6 0 0 0 .92.5l7-4.4a.6.6 0 0 0 0-1l-7-4.4a.6.6 0 0 0-.92.5Z" />
            </svg>
          )}
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(last, 0)}
        step={1}
        value={idx}
        disabled={years.length === 0}
        onChange={(e) => onIdx(Number(e.target.value))}
        aria-label={t("lossTimelineTitle")}
        className="loss-slider w-full cursor-pointer disabled:opacity-40"
        style={{ "--track-bg": trackBg } as React.CSSProperties}
      />
      {years.length > 0 && (
        <div className="mt-0.5 flex justify-between text-[0.68rem] tabular-nums text-muted">
          <span>{years[0]}</span>
          <span>{years[last]}</span>
        </div>
      )}

      {/* density legend: the same amber→red ramp the tiles use */}
      <div className="mt-2 flex items-center gap-1.5 text-[0.64rem] text-muted">
        <span className="shrink-0">{t("lossDensityLow")}</span>
        <span className="h-2.5 flex-1 rounded-full" style={{ background: rampGradient }} />
        <span className="shrink-0">{t("lossDensityHigh")}</span>
      </div>

      <p className="m-0 mt-1.5 text-[0.66rem] leading-snug text-muted">
        {t("lossCanopyNote", { pct: LOSS_CANOPY })} · {t("lossNotDeforestation")}
      </p>
    </div>
  );
}
