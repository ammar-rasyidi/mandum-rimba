"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { LAYERS, colorExpression, type LayerDef } from "@/lib/layers";
import { geodesicAreaHa } from "@/lib/geo-area";
import { TILES_BASE } from "@/lib/api";
import LayerPanel from "./LayerPanel";
import MobilePanelSheet, {
  SHEET_FULL,
  SHEET_PEEK,
  type SheetSnap,
} from "./MobilePanelSheet";
import { useIsMobile } from "@/hooks/useIsMobile";
import DetailDrawer, { type SelectedFeature } from "./DetailDrawer";
import SpeciesInfo from "./SpeciesInfo";
import RealmCaption from "./RealmCaption";
import MapControls from "./MapControls";
import ForestLossTimeline from "./ForestLossTimeline";
import {
  fetchLossMatrix,
  lossFillExpression,
  type LossMatrix,
} from "@/lib/forest-loss";
import mountainsData from "@/data/mountains.json";
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
  filters.viewMode =
    p.get("view") === "globe" || p.get("view") === "terrain"
      ? (p.get("view") as MapFilters["viewMode"])
      : "flat";
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

// Indonesia's three biogeographic realms — the guided globe tour flies to each.
// Centres/zoom frame the realm on the globe; labels/descriptions come from i18n.
export const REALMS = [
  { id: "sundaland", center: [104, -1] as [number, number], zoom: 4.2 },
  { id: "wallacea", center: [122, -3] as [number, number], zoom: 4.4 },
  { id: "papua", center: [138, -4.5] as [number, number], zoom: 4.5 },
];

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
  // guided realm tour: the realm whose caption is currently showing (null = none)
  const [tourRealm, setTourRealm] = useState<string | null>(null);
  // layer panel collapsed to a pill — lifted so the nav controls can hide behind
  // the expanded sheet on mobile
  const [layerMinimized, setLayerMinimized] = useState(false);
  // phones: the layer panel rides in a swipeable bottom sheet instead
  const isMobile = useIsMobile();
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(SHEET_PEEK);
  // forest-loss timeline: the per-region×per-year loss matrix, the year the
  // slider is on, and whether it's auto-playing. Refs mirror the first two so
  // the map's sourcedata listener can re-apply feature-state without re-binding.
  const [lossData, setLossData] = useState<LossMatrix | null>(null);
  const [lossError, setLossError] = useState(false);
  const [lossYearIdx, setLossYearIdx] = useState(0);
  const [lossPlaying, setLossPlaying] = useState(false);
  const lossDataRef = useRef<LossMatrix | null>(null);
  const lossYearIdxRef = useRef(0);
  const showLoss = filters.layers.includes("forestloss");
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

  // guided globe tour of the three biogeographic realms. Flying to a realm
  // switches into the globe view (if flat) so it always reads as a globe
  // experience, then shows a short caption. `playTour` sequences all three.
  const tourTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopTour = useCallback(() => {
    tourTimers.current.forEach(clearTimeout);
    tourTimers.current = [];
  }, []);
  const flyToRealm = useCallback((id: string) => {
    const map = mapRef.current;
    const realm = REALMS.find((r) => r.id === id);
    if (!map || !realm) return;
    // ensure a 3D view; the flyTo below takes over the camera either way
    setFilters((f) => (f.viewMode === "flat" ? { ...f, viewMode: "globe" } : f));
    map.flyTo({
      center: realm.center,
      zoom: realm.zoom,
      pitch: 0,
      bearing: 0,
      duration: 2400,
      essential: true,
    });
    setTourRealm(id);
    tourTimers.current.push(setTimeout(() => setTourRealm(null), 5200));
  }, []);
  const playTour = useCallback(() => {
    stopTour();
    REALMS.forEach((r, i) => {
      tourTimers.current.push(setTimeout(() => flyToRealm(r.id), i * 5200));
    });
  }, [flyToRealm, stopTour]);
  useEffect(() => stopTour, [stopTour]); // clear timers on unmount

  // every view is shareable: state lives in the URL
  const syncUrl = useCallback((f: MapFilters) => {
    const p = new URLSearchParams(window.location.search);
    // position is no longer persisted; drop leftovers from older sessions
    p.delete("lng");
    p.delete("lat");
    p.delete("z");
    p.set("base", f.basemap);
    if (f.viewMode === "flat") p.delete("view");
    else p.set("view", f.viewMode);
    p.set("layers", f.layers.join(","));
    p.set("days", String(f.days));
    p.set("sys", f.systems.join(","));
    p.set("dis", f.disasterTypes.join(","));
    p.set("con", f.concessionTypes.join(","));
    p.set("pro", f.protectedCategories.join(","));
    p.set("cls", f.speciesClasses.join(","));
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, []);

  // ---------- forest-loss timeline ----------
  // mirror data + year into refs so the map's sourcedata handler (bound once)
  // always reads the current values
  useEffect(() => {
    lossDataRef.current = lossData;
  }, [lossData]);
  useEffect(() => {
    lossYearIdxRef.current = lossYearIdx;
  }, [lossYearIdx]);

  // write each province's loss for the active year onto its feature, so the
  // choropleth paint (a step over feature-state) can colour it
  const applyLossYear = useCallback(() => {
    const map = mapRef.current;
    const data = lossDataRef.current;
    if (!map || !data || !map.getLayer("lyr-forestloss")) return;
    const yi = lossYearIdxRef.current;
    for (const r of data.regions) {
      map.setFeatureState(
        { source: "src-loss-regions", sourceLayer: "regions", id: r.id },
        { loss: r.loss[yi] ?? 0 },
      );
    }
  }, []);

  // fetch the matrix the first time the layer is switched on. We still store an
  // empty result (or flag an error) so the timeline can say "no data yet"
  // instead of spinning on "Loading…" forever against an unpopulated DB.
  useEffect(() => {
    if (!showLoss || lossData || lossError) return;
    let alive = true;
    fetchLossMatrix("province").then((d) => {
      if (!alive) return;
      if (!d) {
        setLossError(true);
        return;
      }
      setLossData(d);
      if (d.years.length > 0) setLossYearIdx(d.years.length - 1); // latest year
    });
    return () => {
      alive = false;
    };
  }, [showLoss, lossData, lossError]);

  // re-apply feature-state whenever the data or year changes
  useEffect(() => {
    applyLossYear();
  }, [lossData, lossYearIdx, applyLossYear]);

  // feature-state is per-tile and drops when a tile reloads (pan/zoom); the
  // regions source finishing a load is the cue to write the year's values again
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const onData = (e: maplibregl.MapSourceDataEvent) => {
      if (e.sourceId === "src-loss-regions" && e.isSourceLoaded) applyLossYear();
    };
    map.on("sourcedata", onData);
    return () => {
      map.off("sourcedata", onData);
    };
  }, [ready, applyLossYear]);

  // auto-advance while playing; stop at the last year
  useEffect(() => {
    if (!lossPlaying || !lossData) return;
    const n = lossData.years.length;
    const timer = setInterval(() => {
      setLossYearIdx((i) => {
        if (i >= n - 1) {
          setLossPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 900);
    return () => clearInterval(timer);
  }, [lossPlaying, lossData]);

  const toggleLossPlay = useCallback(() => {
    setLossPlaying((p) => {
      if (!p && lossDataRef.current) {
        const n = lossDataRef.current.years.length;
        if (lossYearIdxRef.current >= n - 1) setLossYearIdx(0); // replay from start
      }
      return !p;
    });
  }, []);

  const lossTotalHa =
    lossData?.regions.reduce((s, r) => s + (r.loss[lossYearIdx] ?? 0), 0) ?? 0;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        // free public glyph server (OpenMapTiles fonts) — needed to render the
        // mountain-name labels; the raster basemaps themselves carry no text
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
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
    // zoom + rotate + compass live in the custom, on-brand <MapControls> overlay
    // (rendered in JSX below) instead of the default NavigationControl
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

      // forest-loss choropleth: paints the shared `regions` tiles (province
      // level) by feature-state, added first so the data layers below draw on
      // top and stay legible. Values are written per year by <ForestLossTimeline>.
      if (avail.has("regions")) {
        map.addSource("src-loss-regions", {
          type: "vector",
          url: `pmtiles://${TILES_BASE}/tiles/regions.pmtiles`,
          promoteId: "id",
        });
        map.addLayer({
          id: "lyr-forestloss",
          type: "fill",
          source: "src-loss-regions",
          "source-layer": "regions",
          filter: ["==", ["get", "level"], "province"],
          layout: {
            visibility: filters.layers.includes("forestloss")
              ? "visible"
              : "none",
          },
          paint: {
            "fill-color": lossFillExpression() as never,
            "fill-opacity": 0.72,
            "fill-outline-color": "rgba(0,0,0,0.28)",
          },
        });
      }

      const added = new Set<string>();
      for (const def of groupLayers) {
        // forest-loss is not its own geometry; it's painted on the regions tiles
        // above by feature-state, so skip the generic builder for it.
        if (def.id === "forestloss") continue;
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

      // major-mountain name labels, on top of everything. Hidden by default;
      // shown only on the satellite basemap (where the imagery carries no text).
      // A ▲ glyph stands in for a summit marker so no icon image is needed.
      map.addSource("mountains", {
        type: "geojson",
        data: mountainsData as GeoJSON.FeatureCollection,
        attribution: "Peaks © OpenStreetMap contributors (ODbL)",
      });
      map.addLayer({
        id: "lyr-mountains",
        type: "symbol",
        source: "mountains",
        // labels appear once you're zoomed in near a mountain (~2 km scale bar),
        // so wider views stay clean instead of crowded with names
        minzoom: 12,
        layout: {
          // name, plus the elevation line only when we have it (some volcanoes
          // carry no `ele`); the ▲ glyph stands in for a summit marker
          "text-field": [
            "case",
            ["has", "ele"],
            [
              "concat",
              "▲ ",
              ["get", "name"],
              "\n",
              ["to-string", ["get", "ele"]],
              " m",
            ],
            ["concat", "▲ ", ["get", "name"]],
          ],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 9, 13],
          "text-anchor": "top",
          "text-offset": [0, 0.2],
          "text-max-width": 8,
          "text-line-height": 1.1,
          // highest peaks win collisions first, so the giants show at low zoom
          // and lesser summits fill in as you zoom in
          "symbol-sort-key": ["-", 9000, ["coalesce", ["get", "ele"], 0]],
          visibility: "none",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.85)",
          "text-halo-width": 1.5,
        },
      });

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
      // Wetland habitat layers: the raw tiles carry only junk source fields
      // (peatland) or nothing at all (mangrove), so replace the property bag
      // with just the useful area. Peatland ships an exact per-polygon
      // shape_Area (m²); mangrove has none, so measure the clicked geometry.
      if (def.id === "peatland" || def.id === "mangrove") {
        const shapeArea = Number(
          (f.properties as Record<string, unknown>)?.shape_Area,
        );
        const exact = def.id === "peatland" && shapeArea > 0;
        const areaHa = exact ? shapeArea / 10_000 : geodesicAreaHa(f.geometry);
        setSelected({ layer: def, properties: { areaHa, areaExact: exact } });
        return;
      }
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

    // mountain-name labels ride with the satellite basemap (the map/dark
    // basemaps already label their own peaks)
    if (map.getLayer("lyr-mountains")) {
      map.setLayoutProperty(
        "lyr-mountains",
        "visibility",
        filters.basemap === "satellite" ? "visible" : "none",
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

  // view mode: flat mercator (default), 3D globe, or globe + real terrain.
  // Kept in its own effect so switching projection/terrain doesn't re-run on
  // every unrelated filter change (which would fight the camera animation).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const mode = filters.viewMode;

    // register the elevation source lazily — only when terrain is first used,
    // so the flat/globe views never fetch DEM tiles. AWS Terrain Tiles
    // (Mapzen / AWS Open Data): free, public, no API key.
    const DEM = "terrain-dem";
    if (mode === "terrain" && !map.getSource(DEM)) {
      map.addSource(DEM, {
        type: "raster-dem",
        tiles: [
          "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png",
        ],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 13,
        attribution: "Elevation: Terrain Tiles (AWS Open Data) | Mandum Rimba",
      });
    }

    // globe projection backs both the globe and terrain views (v5); flat is
    // the plain mercator analytical map.
    map.setProjection({ type: mode === "flat" ? "mercator" : "globe" });
    // elevation only in terrain mode
    // exaggeration >1 makes the relief (and the draped layers over it) read as
    // more pronounced folds; the fill/line layers drape onto this mesh for free
    // exaggeration 1.0 = true elevation. MapLibre freezes elevation while you
    // pan (constant camera height) and recomputes the zoom on drag-end to match
    // the new centre's terrain height — that recompute is the "zoom in/out after
    // I stop dragging" jump, and it scales with elevation × exaggeration. Keeping
    // exaggeration at 1.0 keeps that jump to the natural minimum while still
    // showing real relief. (>1 amplifies the folds but also the jump.)
    map.setTerrain(mode === "terrain" ? { source: DEM, exaggeration: 1.0 } : null);
    // tilt so relief reads as 3D in terrain mode; flatten for the other two.
    // In terrain view the pitch pushes the subject low in the frame, so add
    // bottom padding to lift the globe up the screen; reset it otherwise.
    const h = map.getContainer().clientHeight || 800;
    map.easeTo({
      pitch: mode === "terrain" ? 62 : 0,
      padding: {
        top: 0,
        right: 0,
        left: 0,
        bottom: mode === "terrain" ? Math.round(h * 0.18) : 0,
      },
      duration: 700,
    });
  }, [filters.viewMode, ready]);

  // atmospheric sky for the globe/terrain views — "Earth from space": a blue
  // day atmosphere in light, deep-space night in dark. The atmosphere halo
  // fades out by mid-zoom so it never hazes the terrain when zoomed in. The
  // container's --map-sky paints the void beyond the atmosphere.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    // atmosphere strong on the far-out globe, gone by the time you're in terrain
    const atmosphere = [
      "interpolate",
      ["linear"],
      ["zoom"],
      0,
      0.9,
      5,
      0.6,
      8,
      0,
    ] as unknown as number;
    map.setSky(
      theme === "light"
        ? {
            "sky-color": "#7ab3e8",
            "sky-horizon-blend": 0.7,
            "horizon-color": "#cfe6f7",
            "horizon-fog-blend": 0.5,
            "fog-color": "#eaf4fc",
            "fog-ground-blend": 0.4,
            "atmosphere-blend": atmosphere,
          }
        : {
            "sky-color": "#0b1d3a",
            "sky-horizon-blend": 0.6,
            "horizon-color": "#0a2a5c",
            "horizon-fog-blend": 0.5,
            "fog-color": "#05070d",
            "fog-ground-blend": 0.4,
            "atmosphere-blend": atmosphere,
          },
    );
  }, [theme, ready]);

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
      {/* opaque sky behind the map: in globe & terrain views the canvas is
          transparent above the horizon, so this theme-aware colour (sky blue in
          light, night black in dark) shows there instead of the page bleeding
          through. Hidden under the opaque basemap in the flat view. */}
      <div ref={containerRef} className="relative flex-1 bg-[var(--map-sky)]" />
      <MapControls
        mapRef={mapRef}
        ready={ready}
        panelOpen={isMobile ? sheetSnap === SHEET_FULL : !layerMinimized}
        detailOpen={!!(selected || speciesData)}
      />
      <LayerPanelHost
        isMobile={isMobile}
        sheetSnap={sheetSnap}
        onSheetSnap={setSheetSnap}
        sheetTitle="Layers"
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
        onFlyToRealm={flyToRealm}
        onPlayTour={playTour}
        minimized={layerMinimized}
        onMinimizedChange={setLayerMinimized}
      />
      {/* guided-tour caption: realm name + one line on the wildlife it holds */}
      {tourRealm && (
        <RealmCaption realm={tourRealm} onClose={() => setTourRealm(null)} />
      )}
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
      {/* gate on `ready` (false on the server and the first client render, so
          they match) — `showLoss` derives from URL-seeded filters and would
          otherwise mismatch during hydration when the URL has forestloss on */}
      {ready && showLoss && (
        <ForestLossTimeline
          years={lossData?.years ?? []}
          idx={lossYearIdx}
          onIdx={(i) => {
            setLossPlaying(false);
            setLossYearIdx(i);
          }}
          playing={lossPlaying}
          onPlayToggle={toggleLossPlay}
          totalHa={lossTotalHa}
          loading={!lossData && !lossError}
          unavailable={lossError || (!!lossData && lossData.years.length === 0)}
        />
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

/** Renders the layer panel either as the desktop floating card or, on
 *  phones, inside the swipeable bottom sheet (peek/full snap points; the
 *  panel's own minimize button drops the sheet back to peek). */
function LayerPanelHost({
  isMobile,
  sheetSnap,
  onSheetSnap,
  sheetTitle,
  ...panelProps
}: {
  isMobile: boolean;
  sheetSnap: SheetSnap;
  onSheetSnap: (snap: SheetSnap) => void;
  sheetTitle: string;
} & React.ComponentProps<typeof LayerPanel>) {
  if (!isMobile) return <LayerPanel {...panelProps} />;
  return (
    <MobilePanelSheet snap={sheetSnap} onSnapChange={onSheetSnap} title={sheetTitle}>
      <LayerPanel
        {...panelProps}
        variant="sheet"
        minimized={false}
        onMinimizedChange={(v) => onSheetSnap(v ? SHEET_PEEK : SHEET_FULL)}
      />
    </MobilePanelSheet>
  );
}
