"use client";

import { aqiColor, AQI_RAMP } from "@/lib/air-field";
import { pm25FromUsAqi } from "@mandumrimba/shared";

/**
 * The colour scale for the air layer, in the panel beside its toggle.
 *
 * The gradient is generated from AQI_RAMP — the same array the raster is
 * painted from — rather than being written out as its own list of colours. A
 * hand-copied legend drifts the moment the ramp is touched, and a legend that
 * disagrees with the map is worse than none: it turns a reader's correct
 * inference into a wrong one.
 *
 * Both scales are labelled. AQI is the number people recognise from air-quality
 * apps; µg/m³ is the one that is actually measured and the one our data is in.
 * Showing only the index would hide the quantity behind a convention.
 */

/**
 * The legend axis is the EPA category boundaries, evenly spaced — not AQI
 * plotted linearly. Linear puts 50, 100, 150 and 200 inside the first quarter
 * of a scale that runs to 900, which is how the labels ended up printed on top
 * of each other. Even spacing is also how every AQI legend people already know
 * is drawn, so the shape carries meaning before the numbers are read.
 */
const AXIS = [0, 50, 100, 150, 200, 300, 500];

/** Where a given AQI sits along the legend, 0–1, on the piecewise axis. */
function stop(aqi: number): number {
  const last = AXIS.length - 1;
  if (aqi <= AXIS[0]) return 0;
  for (let i = 1; i <= last; i++) {
    if (aqi <= AXIS[i]) {
      const within = (aqi - AXIS[i - 1]) / (AXIS[i] - AXIS[i - 1]);
      return (i - 1 + within) / last;
    }
  }
  return 1;
}

/** AQI at a fraction along the legend — the inverse, for sampling colours. */
function aqiAt(f: number): number {
  const last = AXIS.length - 1;
  const x = Math.min(1, Math.max(0, f)) * last;
  const i = Math.min(last - 1, Math.floor(x));
  return AXIS[i] + (x - i) * (AXIS[i + 1] - AXIS[i]);
}

/** Boundaries to label. 0 and the top are named in words instead. */
const TICKS = [50, 100, 150, 200, 300];

// Sampled from aqiColor so the bar cannot drift from the map's own painting.
const gradient = `linear-gradient(to right, ${Array.from(
  { length: 48 },
  (_, i) => {
    const f = i / 47;
    const [r, g, b] = aqiColor(aqiAt(f));
    return `rgb(${r},${g},${b}) ${(f * 100).toFixed(1)}%`;
  },
).join(", ")})`;

/**
 * "2026-08-30T06:00" (UTC, no suffix) rendered in WIB with the UTC hour kept
 * alongside. The audience reads local time; the comparison sources — the CAMS
 * and ECMWF viewers — are all in UTC, so dropping it would make this field
 * impossible to check against them.
 */
/** just the WIB clock time, for naming a model step compactly */
function hourOnly(iso: string): string {
  const ms = Date.parse(`${iso}:00Z`);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatValid(iso: string): string | null {
  const ms = Date.parse(`${iso}:00Z`);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const wib = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  const utc = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${wib} WIB (${utc} UTC)`;
}

export default function AirLegend({
  labels,
  validAt,
  between,
  runAt,
}: {
  /** i18n strings, so the component stays free of translation wiring */
  labels: {
    scale: string;
    good: string;
    hazardous: string;
    note: string;
    validPrefix: string;
    noTime: string;
    blended: string;
    run: string;
  };
  /** the hour shown. For a blend this is NOT a model step — see below. */
  validAt: string | null;
  /** the two published steps it was blended from */
  between: [string, string] | null;
  /** the CAMS run those steps came from */
  runAt: string | null;
}) {
  const when = validAt ? formatValid(validAt) : null;
  // Naming the shown hour alone overstates what exists. CAMS publishes every
  // three hours; a value for 15.58 was computed by us from the steps either
  // side of it, and a reader checking against the CAMS viewer will find those
  // steps, not ours. So say which ones, and say the run they came from.
  const isBlend = !!between && between[0] !== between[1];
  const stepsLabel =
    between &&
    (isBlend
      ? `${hourOnly(between[0])}–${hourOnly(between[1])}`
      : hourOnly(between[0]));
  const runLabel = runAt ? formatValid(runAt) : null;

  return (
    <div className="pl-[1.7rem] pt-[0.5rem]">
      <p className="m-0 mb-[0.3rem] text-[0.72rem] text-muted">
        {labels.scale}
      </p>

      <div
        className="relative h-[0.55rem] w-full rounded-[3px]"
        style={{ background: gradient }}
      >
        {TICKS.map((aqi) => (
          <span
            key={aqi}
            aria-hidden
            className="absolute top-0 h-full w-px bg-black/35"
            style={{ left: `${stop(aqi) * 100}%` }}
          />
        ))}
      </div>

      {/* AQI on top, µg/m³ underneath: the index people know, over the quantity
          it is derived from. Positioned at the same stops as the tick marks so
          the two rows and the gradient cannot drift apart. */}
      <div className="relative mt-[0.2rem] h-[0.85rem] w-full">
        {TICKS.map((aqi) => (
          <span
            key={aqi}
            className="absolute -translate-x-1/2 text-[0.62rem] leading-none text-muted"
            style={{ left: `${stop(aqi) * 100}%` }}
          >
            {aqi}
          </span>
        ))}
      </div>
      <div className="relative h-[0.85rem] w-full">
        {TICKS.map((aqi) => {
          const ugm3 = pm25FromUsAqi(aqi);
          return (
            <span
              key={aqi}
              className="absolute -translate-x-1/2 text-[0.62rem] leading-none text-muted opacity-80"
              style={{ left: `${stop(aqi) * 100}%` }}
            >
              {ugm3 == null ? "" : Math.round(ugm3)}
            </span>
          );
        })}
      </div>

      <div className="mt-[0.15rem] flex justify-between text-[0.62rem] text-muted">
        <span>{labels.good}</span>
        <span>{labels.hazardous}</span>
      </div>

      {/* Which hour is on screen. The field is a 3-hourly series and the client
          picks the step nearest to now, so without this a reader cannot tell
          what they are looking at — or line it up against the CAMS viewer. */}
      <p className="m-0 mt-[0.35rem] text-[0.66rem] leading-[1.35] text-fg">
        {labels.validPrefix}{" "}
        <strong className="font-medium">{when ?? labels.noTime}</strong>
      </p>

      {/* What was actually retrieved, as opposed to what is being shown. The
          shown hour is ours; these two lines are the model's, and they are what
          someone checking us against the CAMS viewer needs. */}
      {stepsLabel && (
        <p className="m-0 text-[0.62rem] leading-[1.35] text-muted">
          {isBlend ? labels.blended : labels.validPrefix} {stepsLabel} WIB
        </p>
      )}
      {runLabel && (
        <p className="m-0 text-[0.62rem] leading-[1.35] text-muted">
          {labels.run} {runLabel}
        </p>
      )}

      <p className="m-0 mt-[0.2rem] text-[0.62rem] leading-[1.35] text-muted">
        {labels.note}
      </p>
    </div>
  );
}

/** Exposed for tests and for anything that needs the same swatch as the map. */
export { aqiColor };
