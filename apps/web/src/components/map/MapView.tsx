"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { LAYERS, type LayerDef } from "@/lib/layers";
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
  filters.protectedKinds = list("pro") ?? filters.protectedKinds;
  filters.speciesStatus = list("spc") ?? filters.speciesStatus;
  filters.onlyDiscrepancies = p.get("disc") === "1";

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
  const [ready, setReady] = useState(false);
  const [availableTiles, setAvailableTiles] = useState<string[]>([]);
  const [filters, setFilters] = useState<MapFilters>(
    () => readUrlState().filters,
  );
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const theme = useSiteTheme();

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
    p.set("pro", f.protectedKinds.join(","));
    p.set("spc", f.speciesStatus.join(","));
    p.set("disc", f.onlyDiscrepancies ? "1" : "0");
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
    const discFilter = ["==", ["get", "discrepancy"], 1];

    if (map.getLayer("lyr-alerts")) {
      const all: unknown[] = ["all", dateFilter, systemFilter];
      if (filters.onlyDiscrepancies) all.push(discFilter);
      map.setFilter("lyr-alerts", all as never);
    }
    if (map.getLayer("lyr-discrepancies")) {
      map.setFilter("lyr-discrepancies", [
        "all",
        dateFilter,
        systemFilter,
        discFilter,
      ] as never);
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
        ["get", "kind"],
        ["literal", filters.protectedKinds],
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
      // concessions carry several types in one layer — colour by type so palm
      // / pulp / logging / mining are distinguishable (brown = mining footprint)
      const fillColor =
        def.id === "concessions"
          ? ([
              "match",
              ["get", "type"],
              "palm_hgu",
              "#42a5f5", // blue 400
              "pulp_hti",
              "#7e57c2", // deep-purple 400
              "logging",
              "#26c6da", // cyan 400
              "mining",
              "#8d6e63", // brown 400 — mined land
              def.color,
            ] as unknown as string)
          : def.color;
      // raised opacity + same-color outline so polygons survive the bright,
      // textured satellite basemap
      return {
        ...base,
        type: "fill",
        paint: {
          "fill-color": fillColor,
          "fill-opacity": 0.38,
          "fill-outline-color": fillColor,
        },
      };
    }
    case "circle":
      return {
        ...base,
        type: "circle",
        paint: {
          "circle-color": def.color,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            def.id === "discrepancies" ? 2.5 : 1.5,
            12,
            def.id === "discrepancies" ? 7 : 5,
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
