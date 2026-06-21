"""Export before/after Sentinel-2 composites for a story (manual, per story).

Not part of the daily cron, run this once per story, then upload the PNGs to
R2 under imagery/<story-slug>/{before,after}.png and reference them in the
story document (heroBeforeImg / heroAfterImg).

Requires: pip install earthengine-api ; earthengine authenticate

Usage:
  python export_before_after.py \
      --bbox 96.7,4.4,97.3,4.9 \
      --before 2015-01-01:2015-12-31 \
      --after 2024-01-01:2024-12-31 \
      --out-prefix aceh-flood
"""

import argparse

import ee


def composite(bbox: ee.Geometry, start: str, end: str) -> ee.Image:
    """Cloud-filtered median Sentinel-2 RGB composite."""
    return (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(bbox)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        .median()
        .select(["B4", "B3", "B2"])
        .visualize(min=0, max=3000)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", required=True, help="minLon,minLat,maxLon,maxLat")
    parser.add_argument("--before", required=True, help="YYYY-MM-DD:YYYY-MM-DD")
    parser.add_argument("--after", required=True, help="YYYY-MM-DD:YYYY-MM-DD")
    parser.add_argument("--out-prefix", required=True)
    parser.add_argument("--scale", type=int, default=20, help="meters/pixel")
    args = parser.parse_args()

    ee.Initialize()

    min_lon, min_lat, max_lon, max_lat = map(float, args.bbox.split(","))
    bbox = ee.Geometry.Rectangle([min_lon, min_lat, max_lon, max_lat])

    for label, period in (("before", args.before), ("after", args.after)):
        start, end = period.split(":")
        image = composite(bbox, start, end)
        task = ee.batch.Export.image.toDrive(
            image=image,
            description=f"{args.out_prefix}-{label}",
            folder="forestwatch",
            region=bbox,
            scale=args.scale,
            maxPixels=1e9,
        )
        task.start()
        print(f"started export: {args.out_prefix}-{label} ({start}..{end})")

    print("Monitor at https://code.earthengine.google.com/tasks, download the")
    print("PNGs from Drive, then upload to R2: imagery/<story-slug>/{before,after}.png")


if __name__ == "__main__":
    main()
