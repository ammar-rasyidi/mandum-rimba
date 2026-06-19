"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { LAYERS, colorExpression, type LayerDef } from "@/lib/layers";
import { TILES_BASE } from "@/lib/api";
import LayerPanel from "./LayerPanel";
import DetailDrawer, { type SelectedFeature } from "./DetailDrawer";
import { DEFAULT_FILTERS, type MapFilters } from "./filters";

// actual archipelago extent (Sabang to Merauke), not loose padding —
// fitBounds uses this to frame the country without excess ocean
const INDONESIA_BOUNDS: [number, number, number, number] = [
  94.5, -11.2, 141.5, 6.5,
];

/** site theme (data-theme on <html>), kept in sync for the basemap choice */
function useSiteTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const read = () =>
      setTheme(
        document.documentElement.dataset.theme === "light" ? "light" : "dark",
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function readUrlState(): { filters: MapFilters } {
  const filters = { ...DEFAULT_FILTERS };
  if (typeof window === "undefined") return { filters };
  const p = new URLSearchParams(window.location.search);

  const list = (key: string): string[] | null =>
    p.has(key) ? p.get(key)!.split(",").filter(Boolean) : null;

  filters.basemap = p.get("base") === "satellite" ? "satellite" : "dark";
  filters.layers = list("layers") ?? filters.layers;
  filters.days = Number(p.get("days")) || filters.days;
  filters.systems = list("sys") ?? filters.systems;
  filters.disasterTypes = list("dis") ?? filters.disasterTypes;
  filters.concessionTypes = list("con") ?? filters.concessionTypes;
  filters.protectedCategories = list("pro") ?? filters.protectedCategories;
  filters.speciesStatus = list("spc") ?? filters.speciesStatus;

  return { filters };
}

/** frame the archipelago in the VISIBLE part of the map — the layer panel
 *  covers the right side on desktop, the bottom on mobile */
function fitIndonesia(map: maplibregl.Map) {
  const mobile = window.innerWidth <= 720;
  map.fitBounds(
    [
      [INDONESIA_BOUNDS[0], INDONESIA_BOUNDS[1]],
      [INDONESIA_BOUNDS[2], INDONESIA_BOUNDS[3]],
    ],
    {
      padding: mobile
        ? { top: 80, right: 16, bottom: Math.round(window.innerHeight * 0.4), left: 16 }
        : { top: 90, right: 360, bottom: 40, left: 32 },
      animate: false,
    },
  );
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const searchMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [availableTiles, setAvailableTiles] = useState<string[]>([]);
  const [filters, setFilters] = useState<MapFilters>(
    () => readUrlState().filters,
  );
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const theme = useSiteTheme();

  // pan/zoom to a searched place and drop a green marker at its center. bbox is
  // [west, south, east, north]; the padding mirrors fitIndonesia so the panel
  // doesn't cover the target.
  const flyToBounds = useCallback(
    (bbox: [number, number, number, number], center: [number, number]) => {
      const map = mapRef.current;
      if (!map) return;
      const mobile = window.innerWidth <= 720;
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        {
          padding: mobile
            ? { top: 96, right: 16, bottom: Math.round(window.innerHeight * 0.4), left: 16 }
            : { top: 96, right: 360, bottom: 40, left: 32 },
          maxZoom: 13,
          duration: 900,
        },
      );

      // green dot marking the searched place (replaces any previous one)
      searchMarkerRef.current?.remove();
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:9999px;background:#4caf50;" +
        "border:2px solid #ffffff;box-shadow:0 0 0 4px rgba(76,175,80,0.35)," +
        "0 1px 5px rgba(0,0,0,0.5);cursor:default;";
      searchMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(center)
        .addTo(map);
    },
    [],
  );

  // every view is shareable: state lives in the URL
  const syncUrl = useCallback((f: MapFilters) => {
    const p = new URLSearchParams(window.location.search);
    // position is no longer persisted; drop leftovers from older sessions
    p.delete("lng");
    p.delete("lat");
    p.delete("z");
    p.set("base", f.basemap);
    p.set("layers", f.layers.join(","));
    p.set("days", String(f.days));
    p.set("sys", f.systems.join(","));
    p.set("dis", f.disasterTypes.join(","));
    p.set("con", f.concessionTypes.join(","));
    p.set("pro", f.protectedCategories.join(","));
    p.set("spc", f.speciesStatus.join(","));
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          "basemap-dark": {
            type: "raster",
            tiles: [
              "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors © CARTO | Mandum Rimba",
          },
          "basemap-light": {
            type: "raster",
            tiles: [
              "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors © CARTO | Mandum Rimba",
          },
          "basemap-satellite": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution:
              "Imagery © Esri, Maxar, Earthstar Geographics | Mandum Rimba",
          },
        },
        layers: [
          { id: "basemap-dark", type: "raster", source: "basemap-dark" },
          {
            id: "basemap-light",
            type: "raster",
            source: "basemap-light",
            layout: { visibility: "none" },
          },
          {
            id: "basemap-satellite",
            type: "raster",
            source: "basemap-satellite",
            layout: { visibility: "none" },
          },
        ],
      },
      center: [118, -2.3],
      zoom: 4.4,
      // NO maxBounds: when the viewport spans more degrees than the bounds
      // box, MapLibre overrides fitBounds and re-clamps the camera to the
      // box center — that was exactly the "ocean on the left" bug
      minZoom: 3.5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // initial view ALWAYS frames the archipelago in the visible area
    fitIndonesia(map);
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-left",
    );

    map.on("load", async () => {
      // tilesets for empty collections are never built/uploaded — probe first
      // so we don't request (and 404 on) layers that have no data yet
      const tileNames = [...new Set(LAYERS.map((l) => l.tile))];
      const avail = new Set<string>();
      await Promise.all(
        tileNames.map(async (name) => {
          try {
            const res = await fetch(`${TILES_BASE}/tiles/${name}.pmtiles`, {
              method: "HEAD",
            });
            if (res.ok) avail.add(name);
          } catch {
            // unreachable tile host: treat as unavailable
          }
        }),
      );

      const added = new Set<string>();
      for (const def of LAYERS) {
        if (!avail.has(def.tile)) continue;
        const sourceId = `src-${def.tile}`;
        if (!added.has(sourceId)) {
          map.addSource(sourceId, {
            type: "vector",
            url: `pmtiles://${TILES_BASE}/tiles/${def.tile}.pmtiles`,
          });
          added.add(sourceId);
        }
        map.addLayer(buildLayer(def, sourceId));
      }
      setAvailableTiles([...avail]);
      setReady(true);
    });

    map.on("click", (e) => {
      const layerIds = LAYERS.map((l) => `lyr-${l.id}`).filter((id) =>
        map.getLayer(id),
      );
      const features = map.queryRenderedFeatures(e.point, { layers: layerIds });
      if (features.length === 0) {
        setSelected(null);
        return;
      }
      const f = features[0];
      const def = LAYERS.find((l) => `lyr-${l.id}` === f.layer.id);
      if (!def) return;
      setSelected({
        layer: def,
        properties: f.properties as Record<string, unknown>,
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      maplibregl.removeProtocol("pmtiles");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // push UI state into the map whenever it changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // basemap: "dark" means "street map", which follows the site theme
    const active =
      filters.basemap === "satellite"
        ? "basemap-satellite"
        : theme === "light"
          ? "basemap-light"
          : "basemap-dark";
    for (const id of ["basemap-dark", "basemap-light", "basemap-satellite"]) {
      map.setLayoutProperty(
        id,
        "visibility",
        id === active ? "visible" : "none",
      );
    }

    // layer visibility
    for (const def of LAYERS) {
      const id = `lyr-${def.id}`;
      if (!map.getLayer(id)) continue;
      map.setLayoutProperty(
        id,
        "visibility",
        filters.layers.includes(def.id) ? "visible" : "none",
      );
    }

    // per-layer attribute filters
    const dateFilter = [">=", ["get", "date"], isoDaysAgo(filters.days)];
    const systemFilter = [
      "in",
      ["get", "system"],
      ["literal", filters.systems],
    ];

    if (map.getLayer("lyr-alerts")) {
      map.setFilter("lyr-alerts", ["all", dateFilter, systemFilter] as never);
    }
    if (map.getLayer("lyr-disasters")) {
      map.setFilter("lyr-disasters", [
        "in",
        ["get", "type"],
        ["literal", filters.disasterTypes],
      ] as never);
    }
    if (map.getLayer("lyr-concessions")) {
      map.setFilter("lyr-concessions", [
        "in",
        ["get", "type"],
        ["literal", filters.concessionTypes],
      ] as never);
    }
    if (map.getLayer("lyr-protected")) {
      map.setFilter("lyr-protected", [
        "in",
        ["get", "cat"],
        ["literal", filters.protectedCategories],
      ] as never);
    }
    if (map.getLayer("lyr-species")) {
      map.setFilter("lyr-species", [
        "in",
        ["get", "status"],
        ["literal", filters.speciesStatus],
      ] as never);
    }

    syncUrl(filters);
  }, [filters, ready, syncUrl, theme]);

  return (
    <div className="fixed inset-0 flex">
      <div ref={containerRef} className="relative flex-1" />
      <LayerPanel
        availableTiles={availableTiles}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters({ ...DEFAULT_FILTERS })}
        onGoTo={flyToBounds}
      />
      {selected && (
        <DetailDrawer feature={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function buildLayer(
  def: LayerDef,
  sourceId: string,
): maplibregl.LayerSpecification {
  const base = {
    id: `lyr-${def.id}`,
    source: sourceId,
    "source-layer": def.tile,
    layout: {
      visibility: (def.defaultOn ? "visible" : "none") as "visible" | "none",
    },
  };
  switch (def.kind) {
    case "line":
      return {
        ...base,
        type: "line",
        paint: { "line-color": def.color, "line-width": 1, "line-opacity": 0.8 },
      };
    case "fill": {
      // colour each feature by its category (concessions by type, protected by
      // cat); flat colour for habitat. Same on every basemap.
      const fillColor = colorExpression(def.id, def.color) as unknown as string;
      // habitat is a broad backdrop — keep it faint; the others sit a touch more
      // opaque so polygons survive the bright, textured satellite basemap
      return {
        ...base,
        type: "fill",
        paint: {
          "fill-color": fillColor,
          "fill-opacity": def.id === "habitat" ? 0.3 : 0.45,
          "fill-outline-color": fillColor,
        },
      };
    }
    case "circle":
      return {
        ...base,
        type: "circle",
        paint: {
          // species: colour by IUCN status (CR→LC ramp); others flat
          "circle-color": colorExpression(def.id, def.color) as unknown as string,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            1.5,
            12,
            5,
          ],
          "circle-opacity": 0.9,
          // halo keeps points legible over satellite imagery
          "circle-stroke-color": def.strokeColor ?? "#263238",
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.3,
            12,
            1,
          ],
          "circle-stroke-opacity": 0.9,
        },
      };
  }
}
