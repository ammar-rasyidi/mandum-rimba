/**
 * US EPA Air Quality Index for PM2.5 — computed HERE, from a concentration.
 *
 * We never ingest anyone's AQI. The index is a published formula applied to a
 * µg/m³ measurement, so the honest thing is to take the concentration from a
 * source we can cite (CAMS via Open-Meteo) and do the arithmetic ourselves.
 * That keeps the ≤ 2-click provenance rule intact: the cited number is the
 * concentration, and this file is the whole derivation.
 *
 * Breakpoints are the U.S. EPA table in force since 6 May 2024 (40 CFR Part 58
 * Appendix G; mirrored at aqs.epa.gov/aqsweb/documents/codetables/
 * aqi_breakpoints.csv). The 2024 revision moved the top of "Good" from 12.0 to
 * 9.0 µg/m³ and lowered the Very Unhealthy / Hazardous thresholds, so anything
 * computed against the pre-2024 table reads LOWER than it should.
 *
 * Two deliberate choices, both flagged in the output rather than hidden:
 *
 *  1. No 500 cap. Indonesian haze routinely exceeds the top breakpoint, and
 *     clipping at 500 would make the worst hours of a karhutla season look
 *     identical to the merely terrible ones. Above 325.4 µg/m³ we continue the
 *     Hazardous segment's slope; every such value carries extrapolated=true,
 *     because it sits outside the range EPA actually defined.
 *  2. Hourly values, not a 24-hour average. The map shows air as it is now, so
 *     a plume arriving this hour has to read as one. (EPA's NowCast, the
 *     weighted 12-hour method AirNow reports, lived here until the endpoint
 *     that used it was removed; git has it if it is ever wanted again.)
 */

export type AqiCategory =
  | "good"
  | "moderate"
  | "sensitive"
  | "unhealthy"
  | "very_unhealthy"
  | "hazardous";

export interface AqiBreakpoint {
  /** concentration range, µg/m³ (inclusive) */
  cLo: number;
  cHi: number;
  /** index range (inclusive) */
  iLo: number;
  iHi: number;
  category: AqiCategory;
}

/** U.S. EPA PM2.5 breakpoints, 2024 revision. Ordered, contiguous, ascending. */
export const PM25_BREAKPOINTS: readonly AqiBreakpoint[] = [
  { cLo: 0.0, cHi: 9.0, iLo: 0, iHi: 50, category: "good" },
  { cLo: 9.1, cHi: 35.4, iLo: 51, iHi: 100, category: "moderate" },
  { cLo: 35.5, cHi: 55.4, iLo: 101, iHi: 150, category: "sensitive" },
  { cLo: 55.5, cHi: 125.4, iLo: 151, iHi: 200, category: "unhealthy" },
  { cLo: 125.5, cHi: 225.4, iLo: 201, iHi: 300, category: "very_unhealthy" },
  { cLo: 225.5, cHi: 325.4, iLo: 301, iHi: 500, category: "hazardous" },
] as const;

/** Slope of the Hazardous segment, reused above 325.4 µg/m³ (≈1.99 AQI per µg/m³). */
const TOP = PM25_BREAKPOINTS[PM25_BREAKPOINTS.length - 1];
const TOP_SLOPE = (TOP.iHi - TOP.iLo) / (TOP.cHi - TOP.cLo);

export interface AqiResult {
  /** the concentration the index was computed from, truncated per EPA rules */
  pm25: number;
  aqi: number;
  category: AqiCategory;
  /** true when aqi > 500, i.e. beyond the range EPA defines. Surface this in
   *  the UI — it is our extrapolation, not a published figure. */
  extrapolated: boolean;
}

/** EPA truncates PM2.5 to one decimal BEFORE converting (Appendix G §4(b)). */
function truncate1(ugm3: number): number {
  return Math.floor(ugm3 * 10) / 10;
}

/**
 * Convert a PM2.5 concentration (µg/m³) to the US AQI.
 * Returns null for missing/negative/non-finite input rather than a fake zero —
 * "no reading" and "clean air" must never render the same.
 */
export function usAqiFromPm25(
  ugm3: number | null | undefined,
): AqiResult | null {
  if (ugm3 == null || !Number.isFinite(ugm3) || ugm3 < 0) return null;
  const c = truncate1(ugm3);

  for (const bp of PM25_BREAKPOINTS) {
    if (c <= bp.cHi) {
      // linear interpolation within the segment (Appendix G, equation 1)
      const aqi =
        ((bp.iHi - bp.iLo) / (bp.cHi - bp.cLo)) * (c - bp.cLo) + bp.iLo;
      return {
        pm25: c,
        aqi: Math.max(0, Math.round(aqi)),
        category: bp.category,
        extrapolated: false,
      };
    }
  }

  return {
    pm25: c,
    aqi: Math.round(TOP.iHi + (c - TOP.cHi) * TOP_SLOPE),
    category: "hazardous",
    extrapolated: true,
  };
}

/** Inverse of the above: the concentration at an index value. Used to label a
 *  legend by µg/m³ rather than by an index nobody can feel. */
export function pm25FromUsAqi(aqi: number): number | null {
  if (!Number.isFinite(aqi) || aqi < 0) return null;
  for (const bp of PM25_BREAKPOINTS) {
    if (aqi <= bp.iHi) {
      const c =
        ((bp.cHi - bp.cLo) / (bp.iHi - bp.iLo)) * (aqi - bp.iLo) + bp.cLo;
      return Math.round(c * 10) / 10;
    }
  }
  return Math.round((TOP.cHi + (aqi - TOP.iHi) / TOP_SLOPE) * 10) / 10;
}
