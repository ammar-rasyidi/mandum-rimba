"use client";

import { useState } from "react";

/**
 * The hour player for "Udara & asap", inside the layer panel under the AQI
 * legend rather than floating over the map. The field is one setting among the
 * layer's own, so it belongs with them, and the map keeps its whole view.
 *
 * The axis is mostly the FUTURE. CAMS publishes a forecast, and by the time a
 * cycle reaches us its first hours are already past, so the series runs from
 * about two hours ago to 48 hours ahead. Reading Sunday afternoon's haze as a
 * measurement would be a real error, so the split is made three ways over:
 * the track is solid behind "now" and hatched ahead of it, a marked tick sits
 * at "now", and the readout carries a "prakiraan" pill with how far ahead it
 * is. One of those can be missed; three cannot.
 *
 * Purely presentational. The clock lives in AirField, because at 60 fps it
 * must never pass through React.
 */

const HOUR = 3_600_000;


/** "Min, 6 Sep" — weekday and date, in the reader's own timezone. */
function dayLabel(ms: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(ms));
}

/**
 * The hour, which is the thing being chosen. Formatted by locale — Indonesian
 * separates with a dot (19.00), English with a colon (19:00), and hardcoding
 * either gets one of them wrong.
 *
 * 24-hour in both: this sits beside a CAMS run stamped in UTC, and "11 PM" is
 * one more conversion between the reader and the number they came for.
 */
function timeLabel(ms: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

/** "6 Sep" for the two ends of the track. */
function endLabel(ms: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(new Date(ms));
}

export default function AirTimeline({
  stepsMs,
  atMs,
  onAt,
  playing,
  onPlayToggle,
  locale,
  labels,
  mobile = false,
}: {
  /** epoch ms of every published step, ascending */
  stepsMs: number[];
  /** the moment shown */
  atMs: number;
  onAt: (ms: number) => void;
  playing: boolean;
  onPlayToggle: () => void;
  locale: string;
  /**
   * On a phone the layer panel is a sheet that spends most of its life peeking
   * from the bottom, so a control buried inside it is a control nobody reaches.
   * The player floats above the sheet instead, the same way the tree-cover-loss
   * timeline does — same glass, same rhythm, so the map has one language for
   * "something on this layer moves in time".
   */
  mobile?: boolean;
  labels: {
    title: string;
    forecast: string;
    play: string;
    pause: string;
    toNow: string;
    ahead: string;
  };
}) {
  // shown while the thumb is being dragged or the slider has keyboard focus
  const [scrubbing, setScrubbing] = useState(false);

  if (stepsMs.length < 2) return null;

  const first = stepsMs[0];
  const last = stepsMs[stepsMs.length - 1];
  const span = last - first;
  const now = Date.now();

  const pct = (ms: number) =>
    span > 0 ? ((Math.min(last, Math.max(first, ms)) - first) / span) * 100 : 0;
  const nowPct = pct(now);
  const atPct = pct(atMs);

  const aheadH = Math.round((atMs - now) / HOUR);
  const ahead = aheadH >= 1;
  /** within half an hour of the wall clock: the live view, no "go to now" */
  const atNow = Math.abs(atMs - now) < HOUR / 2;

  /** local midnights inside the window, so a two-day span can be read */
  const midnights: number[] = [];
  const d0 = new Date(first);
  d0.setHours(24, 0, 0, 0);
  for (let t = d0.getTime(); t < last; t += 24 * HOUR) midnights.push(t);

  // On a phone MapView drops this into a bottom-anchored column it owns, so
  // the card only has to be a card.
  const wrapper = mobile
    ? "glass w-full animate-[rise-in_0.24s_ease] rounded-[18px] p-3"
    : "pl-[1.7rem] pt-[0.7rem]";

  return (
    <div className={wrapper}>
      <div className="mb-[0.3rem] flex min-w-0 items-center justify-between gap-2">
        <p className="m-0 truncate text-[0.72rem] text-muted">{labels.title}</p>
        {ahead && (
          <span className="shrink-0 whitespace-nowrap rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-[0.45rem] py-[0.08rem] text-[0.62rem] uppercase tracking-[0.04em] text-muted">
            {labels.forecast}
          </span>
        )}
      </div>

      {/* The hour itself, the thing being chosen, given the weight to match.
          "Sekarang" sits up here rather than beside the slider: down there it
          ate most of the track's width, and the track is what needs the room. */}
      <div className="mb-[0.5rem] flex items-baseline justify-between gap-2">
        <p className="m-0 text-[0.95rem] font-semibold leading-none tabular-nums text-foreground">
          {timeLabel(atMs, locale)}
          <span className="ml-[0.45rem] text-[0.75rem] font-normal text-muted">
            {dayLabel(atMs, locale)}
            {ahead && ` · +${aheadH} ${labels.ahead}`}
          </span>
        </p>
        <button
          type="button"
          onClick={() => onAt(Date.now())}
          disabled={atNow}
          className="shrink-0 cursor-pointer rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-[0.55rem] py-[0.15rem] text-[0.68rem] text-muted transition-[color,border-color,opacity] hover:border-[var(--accent)] hover:text-foreground disabled:cursor-default disabled:opacity-0"
        >
          {labels.toNow}
        </button>
      </div>

      <div className="flex items-center gap-[0.5rem]">
        <button
          type="button"
          onClick={onPlayToggle}
          aria-label={playing ? labels.pause : labels.play}
          className="grid h-[1.85rem] w-[1.85rem] shrink-0 cursor-pointer place-items-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] text-foreground transition-[border-color,background-color] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {playing ? (
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <rect x="1.2" y="0.5" width="3" height="10" rx="0.7" fill="currentColor" />
              <rect x="6.8" y="0.5" width="3" height="10" rx="0.7" fill="currentColor" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <path d="M2 0.6 L10 5.5 L2 10.4 Z" fill="currentColor" />
            </svg>
          )}
        </button>

        {/* No padding here. The track is positioned against this box while the
            thumb is positioned against the INPUT's box, so any padding puts one
            3.3px below the other — which is exactly what it did. */}
        <div className="relative min-w-0 flex-1">
          {/* past: solid. forecast: hatched, so the two are not read as the
              same kind of statement even before the labels are read. */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 overflow-hidden rounded-full bg-[var(--glass-highlight)]">
            <div
              className="absolute inset-y-0 left-0 bg-[var(--text-dim)] opacity-70"
              style={{ width: `${nowPct}%` }}
            />
            <div
              className="absolute inset-y-0 right-0"
              style={{
                left: `${nowPct}%`,
                // wider spacing and a lighter hand than the first attempt: at
                // 2px/5px it read as a texture competing with the map rather
                // than as a quiet "this part has not happened yet"
                backgroundImage:
                  "repeating-linear-gradient(115deg, var(--text-dim) 0 1.5px, transparent 1.5px 7px)",
                opacity: 0.3,
              }}
            />
          </div>

          {/* midnight ticks: a two-day span is unreadable without them */}
          {midnights.map((m) => (
            <div
              key={m}
              className="pointer-events-none absolute top-1/2 h-[9px] w-[1px] -translate-y-1/2 bg-[var(--glass-border)]"
              style={{ left: `${pct(m)}%` }}
              aria-hidden="true"
            />
          ))}

          {/* where "now" falls */}
          <div
            className="pointer-events-none absolute top-1/2 h-[13px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)]"
            style={{ left: `${nowPct}%` }}
            aria-hidden="true"
          />

          {/* Where the thumb is, while it is being moved. The readout above
              says the same thing, but the eye is down here on the track and a
              value you have to look away to read is a value you lose.
              It sits BELOW the track: above, it landed on the readout line and
              covered the very figure it was echoing. */}
          {scrubbing && (
            <div
              className="glass pointer-events-none absolute top-full z-10 mt-[0.25rem] -translate-x-1/2 whitespace-nowrap rounded-[8px] px-[0.4rem] py-[0.12rem] text-[0.66rem] tabular-nums text-foreground"
              style={{ left: `clamp(2.2rem, ${atPct}%, calc(100% - 2.2rem))` }}
            >
              {dayLabel(atMs, locale)} · {timeLabel(atMs, locale)}
            </div>
          )}

          <input
            type="range"
            min={first}
            max={last}
            step={900000}
            value={atMs}
            onChange={(e) => onAt(Number(e.target.value))}
            onPointerDown={() => setScrubbing(true)}
            onPointerUp={() => setScrubbing(false)}
            onPointerCancel={() => setScrubbing(false)}
            onFocus={() => setScrubbing(true)}
            onBlur={() => setScrubbing(false)}
            aria-label={labels.title}
            aria-valuetext={`${dayLabel(atMs, locale)} ${timeLabel(atMs, locale)}`}
            className="air-scrub relative w-full cursor-pointer appearance-none bg-transparent"
            style={{ ["--at" as string]: `${atPct}%` }}
          />
        </div>

      </div>

      {/* Only the two ends. The marker at "now" used to be labelled here too,
          which put the word "Sekarang" on screen twice, once as a landmark and
          once as a button. The tick sits exactly where solid meets hatched, so
          it does not need naming. */}
      <div className={`mt-[0.2rem] flex justify-between text-[0.65rem] text-muted ${mobile ? "" : "pl-[2.35rem]"}`}>
        <span>{endLabel(first, locale)}</span>
        <span>{endLabel(last, locale)}</span>
      </div>

      {/* The native range thumb cannot be styled cross-browser without this. */}
      <style jsx>{`
        /* The thumb is centred by the browser on the RUNNABLE TRACK, not on
           the input box. Leaving that track at its default height is what put
           the circle above the line. Give it the input's own height and the
           two references become one. */
        .air-scrub {
          display: block;
          height: 1.15rem;
          margin: 0;
          padding: 0;
        }
        .air-scrub::-webkit-slider-runnable-track {
          height: 1.15rem;
        }
        .air-scrub::-webkit-slider-thumb {
          -webkit-appearance: none;
          /* (track 1.15rem - thumb 0.85rem) / 2 */
          margin-top: 0.15rem;
          height: 0.85rem;
          width: 0.85rem;
          border-radius: 50%;
          background: var(--bg);
          border: 2.5px solid var(--accent);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
          cursor: grab;
        }
        .air-scrub:active::-webkit-slider-thumb {
          cursor: grabbing;
        }
        .air-scrub::-moz-range-thumb {
          height: 0.85rem;
          width: 0.85rem;
          border-radius: 50%;
          background: var(--bg);
          border: 2.5px solid var(--accent);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
          cursor: grab;
        }
        .air-scrub::-webkit-slider-runnable-track,
        .air-scrub::-moz-range-track {
          background: transparent;
        }
        .air-scrub:focus-visible {
          outline: none;
        }
        .air-scrub:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px var(--accent-dim);
        }
        .air-scrub:focus-visible::-moz-range-thumb {
          box-shadow: 0 0 0 3px var(--accent-dim);
        }
      `}</style>
    </div>
  );
}
