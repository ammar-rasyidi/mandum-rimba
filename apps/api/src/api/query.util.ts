import { BadRequestException } from "@nestjs/common";
import type { Polygon } from "geojson";

/** parse "minLon,minLat,maxLon,maxLat" into a GeoJSON polygon for $geoIntersects */
export function bboxToPolygon(bbox: string): Polygon {
  const parts = bbox.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new BadRequestException("bbox must be minLon,minLat,maxLon,maxLat");
  }
  const [minX, minY, maxX, maxY] = parts;
  return {
    type: "Polygon",
    coordinates: [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ],
  };
}

export function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`invalid date: ${value}`);
  }
  return d;
}

export function clampLimit(value: string | undefined, max = 1000): number {
  const n = Number(value ?? max);
  if (!Number.isFinite(n) || n < 1) return max;
  return Math.min(Math.floor(n), max);
}
