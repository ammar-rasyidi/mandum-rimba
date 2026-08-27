"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { LAYERS, colorExpression, type LayerDef } from "@/lib/layers";
import {
  formatDistance,
  geodesicAreaHa,
  pathLengthM,
} from "@/lib/geo-area";
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
import ShareModal from "./ShareModal";
import PlaceStory from "./PlaceStory";
import { PLACE_STORIES, type PlaceStory as PlaceStoryDef } from "./placeStories";
import ForestLossTimeline from "./ForestLossTimeline";
import { LOSS_ATTRIBUTION, LOSS_YEARS } from "@/lib/forest-loss";
import {
  registerGfwLossProtocol,
  gfwLossTiles,
} from "@/lib/gfw-loss-protocol";
import {
  GIBS_ATTRIBUTION,
  GIBS_REFERENCE_MAXZOOM,
  gibsImageryMaxZoom,
  gibsClampDate,
  gibsDateFloor,
  gibsDefaultDate,
  gibsHotspotTiles,
  gibsImageryTiles,
  gibsReferenceTiles,
  GIBS_REFERENCE,
} from "@/lib/gibs";
import {
  BASEMAP_DARK,
  BASEMAP_LABELS,
  BASEMAP_LIGHT,
} from "@/lib/basemaps";
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

// Southeast Asia extent (Myanmar → Papua, incl. mainland SEA + the Philippines):
// caps the global GFW loss tileset to the region instead of the whole world.
const SEA_BOUNDS: [number, number, number, number] = [92, -11.2, 141.5, 29];

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
  filters.fireConfidence = list("fire") ?? filters.fireConfidence;
  // karhutla (NASA Worldview / GIBS): the day + the two chosen products. The
  // date is only accepted in strict yyyy-mm-dd form — it goes straight into a
  // GIBS request path, so a malformed one would just 404 every tile.
  const kdate = p.get("kdate");
  if (kdate && /^\d{4}-\d{2}-\d{2}$/.test(kdate)) filters.karhutlaDate = kdate;
  filters.karhutlaImagery = p.get("kimg") ?? filters.karhutlaImagery;
  filters.karhutlaHotspot = p.get("khot") ?? filters.karhutlaHotspot;

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
  // the NASA Worldview / GIBS layers belong to the main deforestation map only.
  // /biodiversitas must not create their sources, request their tiles, or carry
  // their state in its URL.
  const hasGibs = groupLayers.some((l) => l.gibs);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const searchMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [availableTiles, setAvailableTiles] = useState<string[]>([]);
  const [filters, setFilters] = useState<MapFilters>(
    () => readUrlState().filters,
  );
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // when sharing from a Place Story, the beat's facts to bake into the card
  const [storyShare, setStoryShare] = useState<{
    id: string;
    name: string;
    region: string;
    eyebrow: string;
    big: string;
    label: string;
    source?: string;
  } | null>(null);
  // cinematic place stories (Kisah Kawasan): the open story + a soft geofence
  // prompt when the map is over a place that has one
  const [storyId, setStoryId] = useState<string | null>(null);
  const [promptStory, setPromptStory] = useState<PlaceStoryDef | null>(null);
  const dismissedStories = useRef<Set<string>>(new Set());
  // biodiversity map: the currently-searched species and its loaded distribution
  const [speciesKey, setSpeciesKey] = useState<number | null>(null);
  const [speciesLabel, setSpeciesLabel] = useState<string>("");
  const [speciesData, setSpeciesData] = useState<SpeciesProfileData | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  // biodiversity "diversity view": all flora points coloured by family, + filter
  const [families, setFamilies] = useState<FamilyStat[]>([]);
  const [familyColors, setFamilyColors] = useState<Record<string, string>>({});
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
  // The clicked feature's outline. Either a filter into the feature's own source
  // (full geometry, when the layer has an idProp) or the clipped geometry we got
  // back from the click (small polygons only). Cleared whenever `selected` is.
  const [highlight, setHighlight] = useState<
    | { kind: "filter"; sourceId: string; sourceLayer: string; prop: string; value: string | number }
    | { kind: "geometry"; geometry: GeoJSON.Geometry }
    | null
  >(null);
  // Ruler: click-to-measure great-circle distance. `measureRef` mirrors the
  // active flag because the map's click handler is bound once, on mount, and
  // would otherwise close over a stale `false`.
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const measureRef = useRef(false);
  measureRef.current = measuring;
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
  // GFW tree-cover-loss timeline: the year the slider is on (index into
  // LOSS_YEARS, cumulative 2001..year) and whether it's auto-playing. The
  // raster tiles come live from GFW, so there's no data of our own to load.
  const [lossYearIdx, setLossYearIdx] = useState(LOSS_YEARS.length - 1);
  const [lossPlaying, setLossPlaying] = useState(false);
  const showLoss = filters.layers.includes("forestloss");
  // The UTC day both NASA Worldview / GIBS layers are actually drawn at, and the
  // single source of truth for it. filters.karhutlaDate is "" until the effect
  // below resolves it (filters.ts explains why it cannot be defaulted at module
  // load), and a hand-edited ?kdate= can land outside the active products'
  // archives — so resolve and clamp HERE, before any tile URL is built, rather
  // than letting the map request a day it would only 404 on.
  const karhutlaDate = gibsClampDate(
    filters.karhutlaDate || gibsDefaultDate(),
    gibsDateFloor(
      filters.layers,
      filters.karhutlaImagery,
      filters.karhutlaHotspot,
    ),
  );
  const theme = useSiteTheme();
  const locale = useLocale();

  // Pin the karhutla date to a real day as soon as we're on the client. Doing it
  // here (rather than in DEFAULT_FILTERS) keeps the server-rendered markup free of
  // anything clock-derived, so the date control hydrates without a mismatch. The
  // day is also clamped into range, since a hand-edited ?kdate= could otherwise
  // sit outside the archive of the products it was paired with.
  useEffect(() => {
    setFilters((f) =>
      f.karhutlaDate === karhutlaDate ? f : { ...f, karhutlaDate },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kisah Kawasan: when the map settles over a place that has a story (and one
  // isn't already playing), offer it with a soft prompt. Dismiss = don't nag.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const check = () => {
      if (storyId) {
        setPromptStory(null);
        return;
      }
      const c = map.getCenter();
      const z = map.getZoom();
      const hit = PLACE_STORIES.find(
        (s) =>
          !dismissedStories.current.has(s.id) &&
          z >= s.minZoom &&
          c.lng >= s.bounds[0] &&
          c.lng <= s.bounds[2] &&
          c.lat >= s.bounds[1] &&
          c.lat <= s.bounds[3],
      );
      setPromptStory(hit ?? null);
    };
    map.on("moveend", check);
    check();
    return () => {
      map.off("moveend", check);
    };
  }, [ready, storyId]);

  // remember the map mode before a story takes over, so we can restore it on exit
  const preStoryView = useRef<Pick<MapFilters, "viewMode" | "basemap"> | null>(null);
  const startStory = (s: PlaceStoryDef) => {
    setPromptStory(null);
    setFilters((f) => {
      preStoryView.current = { viewMode: f.viewMode, basemap: f.basemap };
      // satellite imagery on 3D terrain for the cinematic look
      return { ...f, viewMode: "terrain", basemap: "satellite" };
    });
    setStoryId(s.id);
  };
  const endStory = () => {
    setLossPlaying(false);
    setStoryId(null);
    // drop ?story= so a refresh (or the URL sync) doesn't relaunch the story and
    // the map is fully explorable again
    const url = new URL(window.location.href);
    if (url.searchParams.has("story")) {
      url.searchParams.delete("story");
      window.history.replaceState({}, "", url);
    }
    const prev = preStoryView.current;
    preStoryView.current = null;
    // restore the pre-story view, and bring ALL default layers back on
    setFilters((f) => ({
      ...f,
      viewMode: prev?.viewMode ?? f.viewMode,
      basemap: prev?.basemap ?? f.basemap,
      layers: [...DEFAULT_FILTERS.layers],
    }));
  };

  // deep link: /peta?story=<id> (e.g. from a shared card) auto-opens the story
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || !ready) return;
    deepLinkDone.current = true;
    const sid = new URLSearchParams(window.location.search).get("story");
    const s = sid ? PLACE_STORIES.find((x) => x.id === sid) : null;
    if (s) startStory(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  // each beat shows EXACTLY its layers — everything else is turned off, so the
  // cinematic frame stays clean (empty list = no data layers on this beat)
  const storyLayers = (ids: string[]) =>
    setFilters((f) => {
      const same =
        f.layers.length === ids.length && ids.every((id) => f.layers.includes(id));
      return same ? f : { ...f, layers: [...ids] };
    });
  // a beat can play the tree-cover-loss year animation (2001 → now)
  const animateStoryLoss = (on: boolean) => {
    if (on) {
      setLossYearIdx(0);
      setLossPlaying(true);
    } else setLossPlaying(false);
  };

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
    p.set("fire", f.fireConfidence.join(","));
    if (hasGibs) {
      if (f.karhutlaDate) p.set("kdate", f.karhutlaDate);
      p.set("kimg", f.karhutlaImagery);
      p.set("khot", f.karhutlaHotspot);
    } else {
      // /biodiversitas has no GIBS layers: drop any karhutla keys a pasted URL
      // carried in, rather than leaving dead state in the address bar
      p.delete("kdate");
      p.delete("kimg");
      p.delete("khot");
    }
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [hasGibs]);

  // ---------- GFW tree-cover-loss timeline ----------
  // re-point the raster tiles at the chosen end year; the gfwloss:// protocol
  // recolours each tile to reveal loss cumulatively through that year
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("src-gfw-loss") as
      | maplibregl.RasterTileSource
      | undefined;
    src?.setTiles([gfwLossTiles(LOSS_YEARS[lossYearIdx])]);
  }, [ready, lossYearIdx]);

  // ---------- karhutla: NASA Worldview / GIBS ----------
  // Both GIBS layers carry a TIME dimension baked into their URL, so changing the
  // day (or the product) means re-pointing the source rather than filtering it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    // only re-point when the URL genuinely changed: setTiles drops the tile cache
    // and refetches, and the day resolves to the same value on mount
    const retile = (sourceId: string, url: string) => {
      const src = map.getSource(sourceId) as
        | maplibregl.RasterTileSource
        | undefined;
      if (!src || src.tiles?.[0] === url) return;
      src.setTiles([url]);
    };
    // Imagery products do NOT share a tile pyramid (PACE/OCI tops out one level
    // below the rest), and a raster source's maxzoom is fixed at creation — so a
    // product change that moves the ceiling means rebuilding the source rather
    // than just re-pointing it. Re-added before whatever currently sits above it
    // so the mosaic keeps its place at the bottom of the stack.
    const imgUrl = gibsImageryTiles(filters.karhutlaImagery, karhutlaDate);
    const imgMax = gibsImageryMaxZoom(filters.karhutlaImagery);
    const imgSrc = map.getSource("src-gibs-image") as
      | maplibregl.RasterTileSource
      | undefined;
    if (imgSrc && imgSrc.maxzoom !== imgMax) {
      const arr = map.getStyle().layers;
      const beforeId =
        arr[arr.findIndex((l) => l.id === "lyr-karhutla-image") + 1]?.id;
      const visibility = map.getLayoutProperty(
        "lyr-karhutla-image",
        "visibility",
      );
      map.removeLayer("lyr-karhutla-image");
      map.removeSource("src-gibs-image");
      map.addSource("src-gibs-image", {
        type: "raster",
        tiles: [imgUrl],
        tileSize: 256,
        minzoom: 0,
        maxzoom: imgMax,
        attribution: GIBS_ATTRIBUTION,
      });
      map.addLayer(
        {
          id: "lyr-karhutla-image",
          type: "raster",
          source: "src-gibs-image",
          layout: { visibility },
          paint: { "raster-opacity": 1 },
        },
        beforeId,
      );
    } else {
      retile("src-gibs-image", imgUrl);
    }
    retile(
      "src-gibs-hotspot",
      gibsHotspotTiles(filters.karhutlaHotspot, karhutlaDate),
    );
  }, [ready, karhutlaDate, filters.karhutlaImagery, filters.karhutlaHotspot]);

  // auto-advance while playing; stop at the last year
  useEffect(() => {
    if (!lossPlaying) return;
    const timer = setInterval(() => {
      setLossYearIdx((i) => {
        if (i >= LOSS_YEARS.length - 1) {
          setLossPlaying(false);
          return i;
        }
        return i + 1;
      });
      // 950ms/year: readable but not draggy (≈23s across 2001→2025)
    }, 950);
    return () => clearInterval(timer);
  }, [lossPlaying]);

  const toggleLossPlay = useCallback(() => {
    setLossPlaying((p) => {
      // replay from the start if we're paused at the last year
      if (!p) {
        setLossYearIdx((i) => (i >= LOSS_YEARS.length - 1 ? 0 : i));
      }
      return !p;
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    registerGfwLossProtocol(); // gfwloss:// — recolours GFW loss tiles by year

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        // free public glyph server (OpenMapTiles fonts) — needed to render the
        // mountain-name labels; the raster basemaps themselves carry no text
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
        sources: {
          // CARTO when a key is configured, Esri Canvas when not — see
          // lib/basemaps.ts on why an anonymous CARTO tile is not usable
          "basemap-dark": {
            type: "raster",
            tiles: [BASEMAP_DARK.tiles],
            tileSize: 256,
            attribution: BASEMAP_DARK.attribution,
          },
          "basemap-light": {
            type: "raster",
            tiles: [BASEMAP_LIGHT.tiles],
            tileSize: 256,
            attribution: BASEMAP_LIGHT.attribution,
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
          ...(BASEMAP_LABELS.dark
            ? {
                "basemap-labels": {
                  type: "raster" as const,
                  tiles: [BASEMAP_LABELS.dark],
                  tileSize: 256,
                  attribution: BASEMAP_DARK.attribution,
                },
              }
            : {}),
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
          // place names for the Esri fallback, which serves an unlabelled base.
          // Declared here, with the basemaps, so every data layer added later on
          // `load` still stacks above the labels rather than under them.
          ...(BASEMAP_LABELS.dark
            ? [
                {
                  id: "basemap-labels",
                  type: "raster" as const,
                  source: "basemap-labels",
                  layout: { visibility: "none" as const },
                },
              ]
            : []),
        ],
      },
      center: [118, -2.3],
      zoom: 4.4,
      // NO maxBounds: when the viewport spans more degrees than the bounds
      // box, MapLibre overrides fitBounds and re-clamps the camera to the
      // box center, that was exactly the "ocean on the left" bug
      minZoom: 3.5,
      // allow steep cinematic angles so the raised story layer reads as lifted
      // (default maxPitch is 60, which would clamp the place-story camera).
      // Must stay above AIR.PITCH_MAX in PlaceStory: the flown opening asks for
      // up to 84 deg to hold a distant callout near the horizon, and anything
      // lower here silently clamps it, so the camera ends up at a different
      // tilt from the one the flight computed.
      maxPitch: 85,
      attributionControl: { compact: true },
      // needed so the Share feature can read the WebGL canvas into an image
      canvasContextAttributes: { preserveDrawingBuffer: true },
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
      // load from the bundled file, and the GIBS rasters stream from NASA, so
      // both would 404 against R2 needlessly.
      const tileNames = [
        ...new Set(
          groupLayers
            .filter((l) => !l.geojson && l.kind !== "raster")
            .map((l) => l.tile),
        ),
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

      // Karhutla imagery (NASA Worldview / GIBS true colour): added before
      // everything else so the day's mosaic paints under the loss raster and all
      // the data layers. Live from GIBS, keyless — nothing to probe on R2.
      if (hasGibs) {
        map.addSource("src-gibs-image", {
          type: "raster",
          tiles: [gibsImageryTiles(filters.karhutlaImagery, karhutlaDate)],
          tileSize: 256,
          minzoom: 0,
          // GoogleMapsCompatible_Level9 stops at z8; past that MapLibre stretches
          // the z8 tile rather than requesting one GIBS would 404 on
          maxzoom: gibsImageryMaxZoom(filters.karhutlaImagery),
          attribution: GIBS_ATTRIBUTION,
        });
        map.addLayer({
          id: "lyr-karhutla-image",
          type: "raster",
          source: "src-gibs-image",
          layout: {
            visibility: filters.layers.includes("karhutla-image")
              ? "visible"
              : "none",
          },
          paint: { "raster-opacity": 1 },
        });
        avail.add("karhutla-image"); // live GIBS raster, always available
      }

      // GFW tree-cover-loss: a live encoded raster from GFW's CDN, added first
      // (under the data layers). MapLibre v5 raster-color reads the year from the
      // blue channel; <ForestLossTimeline> recolours it to reveal loss through
      // the chosen year. No tiles of our own — nothing to probe on R2.
      map.addSource("src-gfw-loss", {
        type: "raster",
        tiles: [gfwLossTiles(LOSS_YEARS[lossYearIdx])],
        tileSize: 512,
        minzoom: 0,
        maxzoom: 12,
        // limit the global GFW tileset to Southeast Asia — don't paint loss
        // across the whole world
        bounds: SEA_BOUNDS,
        attribution: LOSS_ATTRIBUTION,
      });
      map.addLayer({
        id: "lyr-forestloss",
        type: "raster",
        source: "src-gfw-loss",
        layout: {
          visibility: filters.layers.includes("forestloss")
            ? "visible"
            : "none",
        },
        paint: { "raster-opacity": 1 },
      });
      avail.add("forestloss"); // live GFW raster, always available in the legend

      const added = new Set<string>();
      for (const def of groupLayers) {
        // forest-loss is the GFW raster added above, not a vector tileset —
        // skip the generic builder for it. Same for the two GIBS rasters, which
        // are added by hand around this loop so they land at the right depth.
        if (def.id === "forestloss" || def.gibs) continue;
        // local GeoJSON layers (distribution areas) load from the bundled file, not R2
        if (def.geojson) {
          const sourceId = `src-${def.id}`;
          if (!added.has(sourceId)) {
            map.addSource(sourceId, {
              type: "geojson",
              data: def.geojson,
              attribution: `<a href="${def.sourceUrl}" target="_blank" rel="noreferrer">${def.sourceName}</a>`,
            });
            added.add(sourceId);
          }
          map.addLayer(buildLayer(def, sourceId));
          avail.add(def.tile); // so the legend shows it as available
          continue;
        }
        if (!avail.has(def.tile)) continue;
        const sourceId = `src-${def.tile}`;
        if (!added.has(sourceId)) {
          // Protected Planet / WDPA requires visible attribution + a link back
          // (non-commercial display is permitted; downloads are not). Every
          // other layer is credited too, matching the "every layer cited" rule.
          const attribution =
            def.id === "protected"
              ? 'Protected areas: <a href="https://www.protectedplanet.net" target="_blank" rel="noreferrer">Protected Planet / WDPA</a> (UNEP-WCMC & IUCN) · KLHK PIPPIB'
              : `<a href="${def.sourceUrl}" target="_blank" rel="noreferrer">${def.sourceName}</a>`;
          map.addSource(sourceId, {
            type: "vector",
            url: `pmtiles://${TILES_BASE}/tiles/${def.tile}.pmtiles`,
            attribution,
          });
          added.add(sourceId);
        }
        map.addLayer(buildLayer(def, sourceId));
      }

      // Karhutla hotspots (NASA Worldview / GIBS thermal anomalies): added after
      // the data layers so detections read on top of concessions and peat. This
      // is a WMS-rendered picture, not features — GIBS publishes the hotspot
      // tiles as EPSG:4326 vector only, which MapLibre can't consume (see
      // lib/gibs.ts). So it is deliberately absent from the click handler below;
      // the FIRMS `fires` layer is the clickable one.
      if (hasGibs) {
        map.addSource("src-gibs-hotspot", {
          type: "raster",
          tiles: [gibsHotspotTiles(filters.karhutlaHotspot, karhutlaDate)],
          tileSize: 512,
          minzoom: 0,
          // the detections are 375 m–1 km; past z12 a finer request buys nothing
          maxzoom: 12,
          attribution: GIBS_ATTRIBUTION,
        });
        map.addLayer({
          id: "lyr-karhutla-hotspot",
          type: "raster",
          source: "src-gibs-hotspot",
          layout: {
            visibility: filters.layers.includes("karhutla-hotspot")
              ? "visible"
              : "none",
          },
          paint: { "raster-opacity": 1 },
        });
        avail.add("karhutla-hotspot"); // live GIBS raster, always available

        // Karhutla reference overlays: labels / borders+roads / coastlines. These
        // are not a layer the user toggles — they ride automatically with the
        // true-colour imagery, which paints over our basemap and takes its place
        // names with it. Added last of the data stack so the ink sits above the
        // imagery AND the hotspots. Static tiles (no TIME), so the date effect
        // never touches them.
        for (const ref of GIBS_REFERENCE) {
          map.addSource(`src-gibs-ref-${ref.key}`, {
            type: "raster",
            tiles: [gibsReferenceTiles(ref.id)],
            tileSize: 256,
            minzoom: 0,
            maxzoom: GIBS_REFERENCE_MAXZOOM,
            attribution: GIBS_ATTRIBUTION,
          });
          map.addLayer({
            id: `lyr-karhutla-ref-${ref.key}`,
            type: "raster",
            source: `src-gibs-ref-${ref.key}`,
            layout: {
              visibility: filters.layers.includes("karhutla-image")
                ? "visible"
                : "none",
            },
            paint: { "raster-opacity": 1 },
          });
        }
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
      // ruler owns the click while it's armed: drop a vertex, and never fall
      // through to feature selection (which would open the detail drawer)
      if (measureRef.current) {
        setMeasurePoints((pts) => [...pts, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      setHighlight(null);
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
      // rasters (the GIBS karhutla pair) hold no queryable features — a click
      // over a GIBS hotspot falls through to whatever data layer is beneath it
      const layerIds = LAYERS.filter((l) => l.kind !== "raster")
        .map((l) => `lyr-${l.id}`)
        .filter((id) => map.getLayer(id));
      const features = map.queryRenderedFeatures(e.point, { layers: layerIds });
      if (features.length === 0) {
        setSelected(null);
        setHighlight(null);
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
      // capture the outline HERE: the wetland branches below replace the
      // property bag wholesale, which would throw away the identifier
      const idValue = def.idProp
        ? (f.properties as Record<string, unknown>)?.[def.idProp]
        : undefined;
      if (
        def.idProp &&
        (typeof idValue === "string" || typeof idValue === "number")
      ) {
        setHighlight({
          kind: "filter",
          sourceId: f.source,
          sourceLayer: f.sourceLayer ?? def.tile,
          prop: def.idProp,
          value: idValue,
        });
      } else if (f.geometry) {
        setHighlight({ kind: "geometry", geometry: f.geometry });
      } else {
        setHighlight(null);
      }
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

    // The Esri fallback's base carries no text, so its labels ride on top of the
    // street views only — the satellite view has its own treatment, and CARTO's
    // styles already include their names, in which case this layer is absent.
    if (map.getLayer("basemap-labels")) {
      const street = filters.basemap !== "satellite";
      map.setLayoutProperty(
        "basemap-labels",
        "visibility",
        street ? "visible" : "none",
      );
      if (street) {
        const src = map.getSource("basemap-labels") as
          | maplibregl.RasterTileSource
          | undefined;
        const want =
          theme === "light" ? BASEMAP_LABELS.light : BASEMAP_LABELS.dark;
        if (want && src && src.tiles?.[0] !== want) src.setTiles([want]);
      }
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

    // the reference overlays follow the imagery rather than a toggle of their own
    const refOn = filters.layers.includes("karhutla-image");
    for (const ref of GIBS_REFERENCE) {
      const id = `lyr-karhutla-ref-${ref.key}`;
      if (!map.getLayer(id)) continue;
      map.setLayoutProperty(id, "visibility", refOn ? "visible" : "none");
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
    if (map.getLayer("lyr-fires")) {
      map.setFilter("lyr-fires", [
        "in",
        ["get", "conf"],
        ["literal", filters.fireConfidence],
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

  // Draw the selected feature's outline: a bright casing-backed line so it reads
  // on the light, dark and satellite basemaps alike. Sits above the data layers
  // but below the ruler, which owns the very top of the stack.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const IDS = ["lyr-highlight-line", "lyr-highlight-casing"];
    const SRC = "src-highlight";
    const clear = () => {
      for (const id of IDS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SRC)) map.removeSource(SRC);
    };
    clear();
    if (!highlight) return;

    let source: string;
    let sourceLayer: string | undefined;
    let filter: unknown[] | undefined;
    if (highlight.kind === "filter") {
      // draw straight from the feature's own tiles, so the whole polygon
      // highlights rather than just the tile that happened to be clicked
      source = highlight.sourceId;
      sourceLayer = highlight.sourceLayer;
      filter = ["==", ["get", highlight.prop], highlight.value];
    } else {
      map.addSource(SRC, {
        type: "geojson",
        data: { type: "Feature", geometry: highlight.geometry, properties: {} },
      });
      source = SRC;
    }
    const base = {
      source,
      ...(sourceLayer ? { "source-layer": sourceLayer } : {}),
      ...(filter ? { filter } : {}),
    } as const;
    map.addLayer({
      ...base,
      id: "lyr-highlight-casing",
      type: "line",
      paint: {
        "line-color": "rgba(0,0,0,0.6)",
        "line-width": 5.5,
        "line-blur": 0.5,
      },
    } as maplibregl.LayerSpecification);
    map.addLayer({
      ...base,
      id: "lyr-highlight-line",
      type: "line",
      paint: {
        "line-color": "#ffffff",
        "line-width": 2.4,
      },
    } as maplibregl.LayerSpecification);
    return clear;
  }, [highlight, ready]);

  // ---------- ruler ----------
  // Crosshair + no double-click zoom while armed, so a fast second vertex
  // doesn't zoom the map out from under the measurement.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor = measuring ? "crosshair" : "";
    if (measuring) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [measuring, ready]);

  // Escape drops out of measuring without clearing the line, so a mis-click
  // doesn't cost the whole measurement
  useEffect(() => {
    if (!measuring) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMeasuring(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [measuring]);

  // the drawn line, its vertices, and a cumulative-distance label per vertex
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const SRC = "src-measure";
    const IDS = [
      "lyr-measure-label",
      "lyr-measure-pt",
      "lyr-measure-line",
      "lyr-measure-casing",
    ];

    if (measurePoints.length === 0) {
      for (const id of IDS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SRC)) map.removeSource(SRC);
      return;
    }

    // one Point feature per vertex carrying its running total, plus the
    // LineString joining them
    let running = 0;
    const features: GeoJSON.Feature[] = measurePoints.map((p, i) => {
      if (i > 0) running = pathLengthM(measurePoints.slice(0, i + 1));
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: p },
        properties: { label: i === 0 ? "" : formatDistance(running, locale) },
      };
    });
    if (measurePoints.length > 1) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: measurePoints },
        properties: { label: "" },
      });
    }
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      return;
    }
    map.addSource(SRC, { type: "geojson", data });
    map.addLayer({
      id: "lyr-measure-casing",
      type: "line",
      source: SRC,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "rgba(0,0,0,0.55)",
        "line-width": 4.6,
      },
    });
    map.addLayer({
      id: "lyr-measure-line",
      type: "line",
      source: SRC,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#ffffff",
        "line-width": 2.2,
        "line-dasharray": [2, 1.4],
      },
    });
    map.addLayer({
      id: "lyr-measure-pt",
      type: "circle",
      source: SRC,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 4.5,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#111417",
        "circle-stroke-width": 1.6,
      },
    });
    map.addLayer({
      id: "lyr-measure-label",
      type: "symbol",
      source: SRC,
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-anchor": "bottom-left",
        "text-offset": [0.55, -0.4],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 1.5,
      },
    });
  }, [measurePoints, ready, locale]);

  return (
    <div className="fixed inset-0 flex">
      {/* opaque sky behind the map: in globe & terrain views the canvas is
          transparent above the horizon, so this theme-aware colour (sky blue in
          light, night black in dark) shows there instead of the page bleeding
          through. Hidden under the opaque basemap in the flat view. */}
      <div ref={containerRef} className="relative flex-1 bg-[var(--map-sky)]" />
      {/* while a cinematic story plays, hide the map chrome for immersion */}
      {!storyId && (
        <MapControls
          mapRef={mapRef}
          ready={ready}
          panelOpen={isMobile ? sheetSnap === SHEET_FULL : !layerMinimized}
          detailOpen={!!(selected || speciesData)}
        />
      )}
      {!storyId && (
      <LayerPanelHost
        isMobile={isMobile}
        sheetSnap={sheetSnap}
        onSheetSnap={setSheetSnap}
        sheetTitle="Layers"
        layers={groupLayers}
        availableTiles={availableTiles}
        filters={filters}
        onChange={setFilters}
        onShare={() => setShareOpen(true)}
        onReset={() => {
          setFilters({ ...DEFAULT_FILTERS });
          setMeasuring(false);
          setMeasurePoints([]);
          setSelected(null);
          setHighlight(null);
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
        karhutlaDate={karhutlaDate}
        measuring={measuring}
        measurePoints={measurePoints.length}
        measureTotalM={pathLengthM(measurePoints)}
        onMeasureToggle={() => setMeasuring((m) => !m)}
        onMeasureUndo={() => setMeasurePoints((p) => p.slice(0, -1))}
        onMeasureClear={() => setMeasurePoints([])}
        minimized={layerMinimized}
        onMinimizedChange={setLayerMinimized}
      />
      )}
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
        <DetailDrawer
          feature={selected}
          onClose={() => {
            setSelected(null);
            setHighlight(null);
          }}
        />
      )}
      {shareOpen && (
        <ShareModal
          mapRef={mapRef}
          basemap={filters.basemap}
          layers={filters.layers}
          species={speciesLabel || undefined}
          story={storyShare ?? undefined}
          onClose={() => {
            setShareOpen(false);
            setStoryShare(null);
          }}
        />
      )}
      {/* Kisah Kawasan: soft prompt when hovering over a place with a story */}
      {promptStory && !storyId && (
        <div className="pointer-events-auto absolute inset-x-0 top-[5.25rem] z-[7] flex justify-center px-3 lg:top-[5.75rem]">
          <div className="glass flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 shadow-lg animate-[panel-in_0.3s_ease]">
            <span className="min-w-0 flex-1 truncate text-[0.84rem]">
              <span className="text-muted">
                {locale === "en" ? "Explore" : "Jelajahi"}{" "}
              </span>
              <b>{promptStory.name}</b>
            </span>
            <button
              onClick={() => startStory(promptStory)}
              className="shrink-0 whitespace-nowrap rounded-full bg-accent px-3.5 py-1.5 text-[0.82rem] font-medium text-[#07130d] transition-[filter] hover:brightness-110"
            >
              {locale === "en" ? "Start →" : "Mulai →"}
            </button>
            <button
              onClick={() => {
                dismissedStories.current.add(promptStory.id);
                setPromptStory(null);
              }}
              aria-label={locale === "en" ? "Dismiss" : "Tutup"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {storyId && (
        <PlaceStory
          mapRef={mapRef}
          story={PLACE_STORIES.find((s) => s.id === storyId)!}
          activeLayers={filters.layers}
          onClose={endStory}
          onSetLayers={storyLayers}
          onAnimateLoss={animateStoryLoss}
          lossYear={LOSS_YEARS[lossYearIdx]}
          lossYears={LOSS_YEARS}
          lossPlaying={lossPlaying}
          onToggleLossPlay={toggleLossPlay}
          onShare={(ctx) => {
            setStoryShare(ctx);
            setShareOpen(true);
          }}
        />
      )}
      {/* gate on `ready` (false on the server and the first client render) so
          showLoss — which derives from URL-seeded filters — can't mismatch
          during hydration when the URL has forestloss on */}
      {ready && showLoss && !storyId && !(isMobile && sheetSnap === SHEET_FULL) && (
        <ForestLossTimeline
          years={LOSS_YEARS}
          idx={lossYearIdx}
          onIdx={(i) => {
            setLossPlaying(false);
            setLossYearIdx(i);
          }}
          playing={lossPlaying}
          onPlayToggle={toggleLossPlay}
          mobile={isMobile}
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
    case "raster":
      // The GIBS karhutla layers are the only rasters, and both are wired up by
      // hand in the load handler (their sources are time-parameterised URLs, not
      // a tileset). Reaching here means one was left in the generic loop.
      throw new Error(
        `raster layer "${def.id}" must be added directly, not via buildLayer`,
      );
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
