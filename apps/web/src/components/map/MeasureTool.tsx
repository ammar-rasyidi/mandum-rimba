"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDistance } from "@/lib/geo-area";

/**
 * Ruler: click the map to drop points, get the running great-circle distance.
 *
 * Deliberately minimal — no area mode, no snapping, no persistence. It answers
 * "how far is this haul road / how wide is this burn scar" while reading the
 * map, which is the question that kept needing a second tab.
 */
export default function MeasureTool({
  active,
  points,
  totalM,
  onToggle,
  onUndo,
  onClear,
}: {
  active: boolean;
  points: number;
  totalM: number;
  onToggle: () => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  const t = useTranslations("map");
  const locale = useLocale();

  const btn =
    "cursor-pointer rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-[0.6rem] py-[0.18rem] text-[0.76rem] text-muted transition-[color,border-color] hover:border-[var(--text-dim)] hover:text-foreground disabled:cursor-default disabled:opacity-40";

  return (
    <div>
      <button
        onClick={onToggle}
        aria-pressed={active}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-[0.7rem] py-[0.42rem] text-[0.8rem] transition-colors ${
          active
            ? "border-accent bg-[var(--accent-dim)] text-accent"
            : "border-dashed border-[var(--glass-border)] bg-[var(--glass-highlight)] text-muted hover:border-[var(--text-dim)] hover:text-foreground"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M2 15.5 15.5 2 22 8.5 8.5 22 2 15.5Z"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <path
            d="M6.5 11 9 13.5M10 7.5l2.5 2.5M14 4l2.5 2.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {active ? t("measureActive") : t("measure")}
      </button>

      {active && (
        <div className="mt-1 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-[0.7rem] py-[0.45rem]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[0.72rem] text-muted">
              {t("measureTotal")}
            </span>
            <span className="text-[1.05rem] font-semibold tabular-nums">
              {formatDistance(totalM, locale)}
            </span>
          </div>
          <div className="mt-[0.35rem] flex items-center justify-between gap-2">
            <span className="text-[0.7rem] text-muted">
              {t("measurePoints", { count: points })}
            </span>
            <span className="flex gap-[0.3rem]">
              <button className={btn} onClick={onUndo} disabled={points === 0}>
                {t("measureUndo")}
              </button>
              <button className={btn} onClick={onClear} disabled={points === 0}>
                {t("measureClear")}
              </button>
            </span>
          </div>
          <p className="m-0 mt-[0.35rem] text-[0.68rem] leading-snug text-muted">
            {t("measureHint")}
          </p>
        </div>
      )}
    </div>
  );
}
