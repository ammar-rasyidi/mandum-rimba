"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { LAYERS, colorExpression, type LayerDef } from "@/lib/layers";
import { TILES_BASE } from "@/lib/api";
import LayerPanel from "./LayerPanel";
import DetailDrawer, { type SelectedFeature } from "./DetailDrawer";
import SpeciesInfo from "./SpeciesInfo";
import {
  getSpecies,
  getFamilies,
  FLORA_POINTS_URL,
  familyColorMap,
  FAMILY_OTHER_COLOR,
  type SpeciesProfileData,
  type FamilyStat,
} from "@/lib/species";
import type { ImportResult } from "@/lib/geo-import";
import { DEFAULT_FILTERS, type MapFilters } from "./filters";

// actual archipelago extent (Sabang to Merauke), not loose padding.
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
  filters.speciesClasses = list("cls") ?? filters.speciesClasses;

  return { filters };
}

/** frame the archipelago in the VISIBLE part of the map, the layer panel
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

export default function MapView({ group }: { group?: "biodiversity" } = {}) {
  // each map (deforestation vs biodiversity) shows only its own layer group
  const groupLayers = LAYERS.filter(
    (l) => (l.group ?? "main") === (group ?? "main"),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const searchMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [availableTiles, setAvailableTiles] = useState<string[]>([]);
  const [filters, setFilters] = useState<MapFilters>(
    () => readUrlState().filters,
  );
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  // biodiversity map: the currently-searched species and its loaded distribution
  const [speciesKey, setSpeciesKey] = useState<number | null>(null);
  const [speciesLabel, setSpeciesLabel] = useState<string>("");
  const [speciesData, setSpeciesData] = useState<SpeciesProfileData | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  // biodiversity "diversity view": all flora points coloured by family, + filter
  const [families, setFamilies] = useState<FamilyStat[]>([]);
  const [familyColors, setFamilyColors] = useState<Record<string, string>>({});
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
  // /peta: an uploaded project boundary (KMZ/KML/DXF) overlaid on the map
  const [boundary, setBoundary] = useState<{
    geojson: GeoJSON.FeatureCollection;
    name: string;
  } | null>(null);
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
    p.set("cls", f.speciesClasses.join(","));
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
      // box center, that was exactly the "ocean on the left" bug
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
      // tilesets for empty collections are never built/uploaded, probe first
      // so we don't request (and 404 on) layers that have no data yet. Only
      // R2-PMTiles layers are probed; GeoJSON-backed layers (ecoregions, biogeo)
      // load from the bundled file, so they'd 404 against R2 needlessly.
      const tileNames = [
        ...new Set(groupLayers.filter((l) => !l.geojson).map((l) => l.tile)),
      ];
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
      for (const def of groupLayers) {
        // local GeoJSON layers (distribution areas) load from the bundled file, not R2
        if (def.geojson) {
          const sourceId = `src-${def.id}`;
          if (!added.has(sourceId)) {
            map.addSource(sourceId, { type: "geojson", data: def.geojson });
            added.add(sourceId);
          }
          map.addLayer(buildLayer(def, sourceId));
          avail.add(def.tile); // so the legend shows it as available
          continue;
        }
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
      // species-atlas occurrence record: show a provenance popup (dataset, year,
      // basis, GBIF link) instead of the feature drawer.
      if (map.getLayer("lyr-sp-points")) {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: ["lyr-sp-points"],
        });
        if (hits.length > 0) {
          const p = (hits[0].properties ?? {}) as Record<string, unknown>;
          const gbif = Number(p.gbifKey) || 0;
          const html =
            `<div style="max-width:210px">` +
            `<strong>${p.basis ?? "record"}</strong>` +
            (p.year ? ` · ${p.year}` : "") +
            (p.dataset
              ? `<br><span style="opacity:.7">dataset ${String(p.dataset).slice(0, 8)}…</span>`
              : "") +
            (gbif
              ? `<br><a href="https://www.gbif.org/occurrence/${gbif}" target="_blank" rel="noreferrer">GBIF record ↗</a>`
              : "") +
            `</div>`;
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
          return;
        }
      }
      // diversity view: clicking any flora dot opens that species in the side
      // panel (photo + description + records), following the app theme.
      if (map.getLayer("lyr-flora-all")) {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: ["lyr-flora-all"],
        });
        if (hits.length > 0) {
          const p = (hits[0].properties ?? {}) as Record<string, unknown>;
          const key = Number(p.k) || 0;
          if (key) {
            popupRef.current?.remove();
            setSpeciesLabel(String(p.c || ""));
            setSpeciesKey(key);
          }
          return;
        }
      }
      const layerIds = LAYERS.map((l) => `lyr-${l.id}`).filter((id) =>
        map.getLayer(id),
      );
      const features = map.queryRenderedFeatures(e.point, { layers: layerIds });
      if (features.length === 0) {
        setSelected(null);
        return;
      }
      // Peta Sebaran Satwa is the bottom layer; when it's the topmost hit (i.e.
      // nothing else is on this spot), gather EVERY class-area under the click
      // and group the recorded species by class, "what birds / mammals / etc.
      // are here". MapLibre serialises the species array to a string, so parse.
      if (features[0].layer.id === "lyr-species-dist") {
        // each species is a [scientificName, iucnCode] pair; dedupe by name and
        // order by conservation severity so the most threatened lead the list.
        const RANK: Record<string, number> = {
          EX: 7,
          EW: 6,
          CR: 5,
          EN: 4,
          VU: 3,
          NT: 2,
          LC: 1,
        };
        // species entries are [sciName, iucnCode, source?] where source "doc"
        // means a documented-range marker (e.g. rhino), not a field observation.
        const byClassMap: Record<
          string,
          Map<string, { cat: string; doc: boolean }>
        > = {};
        let date = "";
        for (const f of features) {
          if (f.layer.id !== "lyr-species-dist") continue;
          const p = (f.properties ?? {}) as Record<string, unknown>;
          const cls = String(p.class ?? "");
          if (p.date) date = String(p.date);
          let sp: string[][] = [];
          try {
            const raw =
              typeof p.species === "string"
                ? JSON.parse(p.species)
                : p.species;
            if (Array.isArray(raw)) sp = raw as string[][];
          } catch {
            /* ignore malformed */
          }
          const m = byClassMap[cls] ?? (byClassMap[cls] = new Map());
          for (const [name, cat, src] of sp)
            if (name) m.set(name, { cat: cat ?? "", doc: src === "doc" });
        }
        const byClass: Record<
          string,
          { sci: string; cat: string; doc: boolean }[]
        > = {};
        for (const [cls, m] of Object.entries(byClassMap)) {
          byClass[cls] = [...m.entries()]
            .map(([sci, v]) => ({ sci, cat: v.cat, doc: v.doc }))
            .sort((a, b) => (RANK[b.cat] ?? 0) - (RANK[a.cat] ?? 0));
        }
        const def = LAYERS.find((l) => l.id === "species-dist");
        if (def) setSelected({ layer: def, properties: { byClass, date } });
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
    if (map.getLayer("lyr-species-dist")) {
      map.setFilter("lyr-species-dist", [
        "in",
        ["get", "class"],
        ["literal", filters.speciesClasses],
      ] as never);
    }

    syncUrl(filters);
  }, [filters, ready, syncUrl, theme]);

  // biodiversity map: load the searched species' distribution (real occurrence
  // records + a derived range outline) and render it. Layers are added/removed
  // dynamically as the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    const clear = () => {
      for (const id of [
        "lyr-sp-range-fill",
        "lyr-sp-range-line",
        "lyr-sp-points",
      ]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const s of ["src-sp-range", "src-sp-points"]) {
        if (map.getSource(s)) map.removeSource(s);
      }
      popupRef.current?.remove();
    };

    if (speciesKey == null) {
      clear();
      setSpeciesData(null);
      return;
    }

    (async () => {
      const data = await getSpecies(speciesKey);
      if (cancelled || !data) return;
      clear();
      // show the real occurrence records exactly as they are — raw dots, no
      // derived range polygon (that was an approximation we don't want to imply).
      // For collection-sensitive taxa the stored coords are already coarsened
      // (~22km); render them as soft area blobs (not sharp pinpoints) so the
      // view stays honest about the obscuring and doesn't imply a precise spot.
      const sensitive = data.species.sensitive === true;
      map.addSource("src-sp-points", { type: "geojson", data: data.points });
      map.addLayer({
        id: "lyr-sp-points",
        type: "circle",
        source: "src-sp-points",
        paint: {
          "circle-color": "#ffca28",
          // sensitive taxa: large, heavily-blurred blobs so the coarsened
          // (~22km) points overlap into one broad region, not distinct spots
          "circle-radius": sensitive
            ? ["interpolate", ["linear"], ["zoom"], 4, 18, 9, 70]
            : ["interpolate", ["linear"], ["zoom"], 4, 2.2, 12, 5],
          "circle-stroke-color": "#1b1b1b",
          "circle-stroke-width": sensitive ? 0 : 0.6,
          "circle-opacity": sensitive ? 0.16 : 0.9,
          "circle-blur": sensitive ? 1 : 0,
        },
      });
      setSpeciesData(data);

      const bb = data.species.bbox;
      if (bb) {
        const mobile = window.innerWidth <= 720;
        map.fitBounds(
          [
            [bb[0], bb[1]],
            [bb[2], bb[3]],
          ],
          {
            padding: mobile
              ? { top: 96, right: 16, bottom: Math.round(window.innerHeight * 0.4), left: 16 }
              : { top: 96, right: 360, bottom: 40, left: 32 },
            // don't zoom in tight on sensitive taxa — the coords are coarse
            maxZoom: sensitive ? 7 : 9,
            duration: 900,
          },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesKey, ready]);

  // biodiversity "diversity view": load ALL flora points, coloured by family, so
  // people see at a glance how rich Indonesia's flora is. Loaded once on ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || group !== "biodiversity") return;
    let cancelled = false;
    (async () => {
      const fams = await getFamilies();
      if (cancelled) return;
      const colors = familyColorMap(fams);
      setFamilies(fams);
      setFamilyColors(colors);
      if (map.getLayer("lyr-flora-all")) map.removeLayer("lyr-flora-all");
      if (map.getSource("src-flora-all")) map.removeSource("src-flora-all");
      // points load straight from R2 (static GeoJSON); props use short keys
      // f=family, k=speciesKey, c=canonical
      map.addSource("src-flora-all", { type: "geojson", data: FLORA_POINTS_URL });
      const match: unknown[] = ["match", ["get", "f"]];
      for (const [fam, col] of Object.entries(colors)) match.push(fam, col);
      match.push(FAMILY_OTHER_COLOR);
      map.addLayer({
        id: "lyr-flora-all",
        type: "circle",
        source: "src-flora-all",
        paint: {
          "circle-color": match as unknown as string,
          // sensitive taxa (x=1) render as large, diffuse blobs (coarsened
          // ~22km location) so they read as a broad region, not a precise spot.
          // NOTE: "zoom" must be the direct input of a top-level interpolate —
          // it can't be nested inside "*"/"case" — so the sensitive size lives
          // in the interpolate output stops instead.
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            ["case", ["==", ["get", "x"], 1], 14, 1.6],
            10,
            ["case", ["==", ["get", "x"], 1], 44, 4],
          ] as unknown as number,
          "circle-opacity": ["case", ["==", ["get", "x"], 1], 0.16, 0.78] as unknown as number,
          "circle-blur": ["case", ["==", ["get", "x"], 1], 1, 0] as unknown as number,
          "circle-stroke-color": "#12232a",
          // no hard edge on sensitive blobs — keep them fuzzy/area-like
          "circle-stroke-width": ["case", ["==", ["get", "x"], 1], 0, 0.3] as unknown as number,
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, group]);

  // filter the diversity layer by family (empty = show all)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("lyr-flora-all")) return;
    map.setFilter(
      "lyr-flora-all",
      selectedFamilies.length === 0
        ? null
        : (["in", ["get", "f"], ["literal", selectedFamilies]] as never),
    );
  }, [selectedFamilies]);

  // when a single species is selected, hide the all-flora cloud (and show it
  // again when the selection is cleared) so the one species reads clearly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("lyr-flora-all")) return;
    map.setLayoutProperty(
      "lyr-flora-all",
      "visibility",
      speciesKey == null ? "visible" : "none",
    );
  }, [speciesKey, speciesData]);

  // /peta: overlay an uploaded project boundary (KMZ/KML/DXF) and frame it
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const clear = () => {
      for (const id of [
        "lyr-boundary-fill",
        "lyr-boundary-line",
        "lyr-boundary-point",
      ])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("src-boundary")) map.removeSource("src-boundary");
    };
    if (!boundary) {
      clear();
      return;
    }
    clear();
    map.addSource("src-boundary", { type: "geojson", data: boundary.geojson });
    map.addLayer({
      id: "lyr-boundary-fill",
      type: "fill",
      source: "src-boundary",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#e040fb", "fill-opacity": 0.15 },
    });
    map.addLayer({
      id: "lyr-boundary-line",
      type: "line",
      source: "src-boundary",
      paint: {
        "line-color": "#ea80fc",
        "line-width": 2.5,
        "line-opacity": 0.95,
      },
    });
    map.addLayer({
      id: "lyr-boundary-point",
      type: "circle",
      source: "src-boundary",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": "#ea80fc",
        "circle-radius": 4,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    });
    const bb = geojsonBounds(boundary.geojson);
    if (bb) {
      const mobile = window.innerWidth <= 720;
      map.fitBounds(
        [
          [bb[0], bb[1]],
          [bb[2], bb[3]],
        ],
        {
          padding: mobile
            ? { top: 96, right: 16, bottom: Math.round(window.innerHeight * 0.4), left: 16 }
            : { top: 96, right: 360, bottom: 40, left: 32 },
          maxZoom: 15,
          duration: 900,
        },
      );
    }
  }, [boundary, ready]);

  return (
    <div className="fixed inset-0 flex">
      <div ref={containerRef} className="relative flex-1" />
      <LayerPanel
        layers={groupLayers}
        availableTiles={availableTiles}
        filters={filters}
        onChange={setFilters}
        onReset={() => {
          setFilters({ ...DEFAULT_FILTERS });
          setSelectedFamilies([]);
          setSpeciesKey(null);
          setSpeciesLabel("");
        }}
        onGoTo={flyToBounds}
        onSpeciesSelect={
          group === "biodiversity"
            ? (key, label) => {
                setSpeciesLabel(label);
                setSpeciesKey(key);
              }
            : undefined
        }
        speciesLabel={speciesLabel}
        families={group === "biodiversity" ? families : undefined}
        familyColors={familyColors}
        selectedFamilies={selectedFamilies}
        onToggleFamily={(fam) =>
          setSelectedFamilies((cur) =>
            cur.includes(fam)
              ? cur.filter((f) => f !== fam)
              : [...cur, fam],
          )
        }
        onClearFamilies={() => setSelectedFamilies([])}
        onBoundaryLoaded={
          group === "biodiversity"
            ? undefined
            : (r: ImportResult, name: string) =>
                setBoundary({ geojson: r.geojson, name })
        }
        boundaryName={boundary?.name}
        onClearBoundary={() => setBoundary(null)}
      />
      {speciesData && (
        <SpeciesInfo
          data={speciesData}
          onClose={() => {
            setSpeciesKey(null);
            setSpeciesLabel("");
          }}
        />
      )}
      {selected && (
        <DetailDrawer feature={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

/** [w, s, e, n] bounds of every coordinate in a GeoJSON FeatureCollection. */
function geojsonBounds(
  fc: GeoJSON.FeatureCollection,
): [number, number, number, number] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const walk = (c: unknown): void => {
    if (
      Array.isArray(c) &&
      typeof c[0] === "number" &&
      typeof c[1] === "number"
    ) {
      const [x, y] = c as [number, number];
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    } else if (Array.isArray(c)) {
      for (const item of c) walk(item);
    }
  };
  for (const f of fc.features)
    if (f.geometry && "coordinates" in f.geometry)
      walk((f.geometry as { coordinates: unknown }).coordinates);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

function buildLayer(
  def: LayerDef,
  sourceId: string,
): maplibregl.LayerSpecification {
  const base = {
    id: `lyr-${def.id}`,
    source: sourceId,
    // GeoJSON sources have no source-layer; vector tiles do
    ...(def.geojson ? {} : { "source-layer": def.tile }),
    layout: {
      visibility: (def.defaultOn ? "visible" : "none") as "visible" | "none",
    },
  };
  switch (def.kind) {
    case "line":
      return {
        ...base,
        type: "line",
        paint: {
          "line-color": colorExpression(def.id, def.color) as unknown as string,
          "line-width": 2.4,
          "line-opacity": 0.9,
        },
      };
    case "fill": {
      // Peta Sebaran Satwa: smooth density bands (organic contour polygons).
      // Colour by animal class (so the class chips read at a glance); the
      // density band drives opacity (sparse edge -> dense core).
      if (def.id === "species-dist") {
        const c = colorExpression(def.id, def.color) as unknown as string;
        return {
          ...base,
          type: "fill",
          paint: {
            "fill-color": c,
            "fill-opacity": 0.4,
            "fill-outline-color": c, // class-coloured edge, like the concessions
          },
        };
      }
      // fills that carry their own per-feature colour (ecoregions: RESOLVE COLOR)
      if (def.colorProp) {
        return {
          ...base,
          type: "fill",
          paint: {
            "fill-color": ["get", def.colorProp] as unknown as string,
            "fill-opacity": 0.5,
            "fill-outline-color": "rgba(255,255,255,0.28)",
          },
        };
      }
      // colour each feature by its category (concessions by type, protected by
      // cat). Same on every basemap.
      const fillColor = colorExpression(def.id, def.color) as unknown as string;
      // a touch opaque so polygons survive the bright, textured satellite basemap
      return {
        ...base,
        type: "fill",
        paint: {
          "fill-color": fillColor,
          "fill-opacity": 0.45,
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
