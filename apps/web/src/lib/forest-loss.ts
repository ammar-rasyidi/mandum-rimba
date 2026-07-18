import { API_BASE } from "./api";

/** Compact per-region × per-year tree-cover-loss matrix (loss aligned to
 *  `years` by index). Served by GET /v1/regions/loss-matrix. */
export interface LossMatrix {
  years: number[];
  max: number;
  level: string;
  regions: { id: string; name: string; nameEn: string; loss: number[] }[];
}

export async function fetchLossMatrix(
  level = "province",
): Promise<LossMatrix | null> {
  try {
    const res = await fetch(
      `${API_BASE}/v1/regions/loss-matrix?level=${level}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as LossMatrix;
  } catch {
    return null;
  }
}

/**
 * Sequential loss ramp, `[threshold_ha, color]` ascending. Shared by the map
 * paint (a `step` expression over feature-state) and the timeline legend so the
 * two never drift. A value below the first threshold (0 / no data) is drawn
 * transparent on the map.
 */
export const LOSS_STOPS: [number, string][] = [
  [1, "#fde68a"], // amber 200
  [1_000, "#fdba4d"],
  [5_000, "#fb8c3a"],
  [20_000, "#f2612c"],
  [50_000, "#dc2f1f"],
  [100_000, "#b01015"],
  [200_000, "#7a0d15"], // darkest red = worst years
];

/** MapLibre `step` expression colouring each region by its per-year loss, which
 *  MapView writes onto the feature via `setFeatureState({ loss })`. */
export function lossFillExpression(): unknown[] {
  const stops: unknown[] = [];
  for (const [threshold, color] of LOSS_STOPS) stops.push(threshold, color);
  return [
    "step",
    ["coalesce", ["feature-state", "loss"], 0],
    "rgba(0,0,0,0)", // 0 / no data → transparent
    ...stops,
  ];
}

/** Short human label for a hectare threshold, e.g. 20000 → "20rb". */
export function shortHa(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}jt`;
  if (n >= 1_000) return `${n / 1_000}rb`;
  return String(n);
}
