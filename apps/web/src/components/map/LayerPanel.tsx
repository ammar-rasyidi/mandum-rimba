"use client";


import { useTranslations } from "next-intl";
import { LAYER_SUBCOLORS, swatchColor, type LayerDef } from "@/lib/layers";
import PlaceSearch from "./PlaceSearch";
import SpeciesSearch from "./SpeciesSearch";
import BoundaryUpload from "./BoundaryUpload";
import type { FamilyStat } from "@/lib/species";
import type { ImportResult } from "@/lib/geo-import";
import {
  ALERT_SYSTEMS,
  CONCESSION_TYPES,
  DISASTER_TYPES,
  PROTECTED_CATEGORIES,
  SPECIES_CLASSES,
  VIEW_MODES,
  type Basemap,
  type MapFilters,
} from "./filters";

interface Props {
  /** the layers for this map (deforestation map vs biodiversity map) */
  layers: LayerDef[];
  /** tile names that actually exist on R2; others render disabled */
  availableTiles: string[];
  filters: MapFilters;
  onChange: (next: MapFilters) => void;
  onReset: () => void;
  /** pan/zoom the map to a searched place + drop a marker at its center */
  onGoTo: (
    bbox: [number, number, number, number],
    center: [number, number],
    label: string,
  ) => void;
  /** biodiversity map only: pick a species to show its distribution */
  onSpeciesSelect?: (key: number, label: string) => void;
  /** the currently-selected species label (for the search box) */
  speciesLabel?: string;
  /** biodiversity diversity view: top families (colour-coded) + filter */
  families?: FamilyStat[];
  familyColors?: Record<string, string>;
  selectedFamilies?: string[];
  onToggleFamily?: (family: string) => void;
  onClearFamilies?: () => void;
  /** /peta only: overlay an uploaded project boundary (KMZ/KML/DXF) */
  onBoundaryLoaded?: (result: ImportResult, filename: string) => void;
  boundaryName?: string;
  onClearBoundary?: () => void;
  /** guided globe tour: fly to a biogeographic realm / play the full tour */
  onFlyToRealm?: (realm: string) => void;
  onPlayTour?: () => void;
  /** minimized (collapsed to a pill) — lifted so the map nav controls can hide
   *  behind the expanded sheet on mobile */
  minimized: boolean;
  onMinimizedChange: (v: boolean) => void;
  /** "float": the desktop card, absolutely positioned over the map.
   *  "sheet": chrome-less flow content rendered inside MobilePanelSheet
   *  (which brings its own frame, scrolling and drag gesture). */
  variant?: "float" | "sheet";
}

/** the three biogeographic realms, in west-to-east tour order */
const REALM_IDS = ["sundaland", "wallacea", "papua"];
// TEMP: hide the guided realm-tour control for now (flip to true to bring it
// back — all the wiring/logic stays intact behind this flag)
const SHOW_REALM_TOUR = false;

/** which sub-filter belongs under which layer row */
const SUB_FILTERS: Record<
  string,
  | {
      key:
        | "systems"
        | "disasterTypes"
        | "concessionTypes"
        | "protectedCategories"
        | "speciesClasses";
      options: string[];
    }
  | undefined
> = {
  alerts: { key: "systems", options: ALERT_SYSTEMS },
  disasters: { key: "disasterTypes", options: DISASTER_TYPES },
  concessions: { key: "concessionTypes", options: CONCESSION_TYPES },
  protected: { key: "protectedCategories", options: PROTECTED_CATEGORIES },
  "species-dist": { key: "speciesClasses", options: SPECIES_CLASSES },
};

// TEMP (2026-06): hidden from the filter menu until their data is ready:
// "alerts" (deforestasi) and "disasters" (banjir/longsor). To bring them back,
// remove the id(s) below. Nothing else (layer registry, map, ingest) changed.
const HIDDEN_LAYERS = new Set(["alerts", "disasters"]);

export default function LayerPanel({
  layers,
  availableTiles,
  filters,
  onChange,
  onReset,
  onGoTo,
  onSpeciesSelect,
  speciesLabel,
  families,
  familyColors,
  selectedFamilies,
  onToggleFamily,
  onClearFamilies,
  onBoundaryLoaded,
  boundaryName,
  onClearBoundary,
  onFlyToRealm,
  onPlayTour,
  minimized,
  onMinimizedChange,
  variant = "float",
}: Props) {
  const t = useTranslations("map");

  if (minimized && variant === "float") {
    return (
      <button
        className="glass absolute right-3 top-[5.75rem] z-[5] cursor-pointer rounded-full px-[1.1rem] py-[0.55rem] text-[0.85rem] text-foreground transition-[transform,border-color] hover:-translate-y-px max-[720px]:bottom-5 max-[720px]:top-auto"
        onClick={() => onMinimizedChange(false)}
        aria-label={t("layers")}
      >
        ☰ {t("layers")}
      </button>
    );
  }

  const set = <K extends keyof MapFilters>(key: K, value: MapFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const toggleIn = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const panelBtn =
    "cursor-pointer rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] px-[0.6rem] py-[0.18rem] text-[0.78rem] text-muted transition-[color,border-color] hover:border-[var(--text-dim)] hover:text-foreground";
  const subFilters = "flex flex-wrap gap-[0.35rem] pl-[1.7rem] pt-[0.45rem]";
  const chip =
    "inline-flex cursor-pointer select-none items-center gap-[0.3rem] rounded-full border border-[var(--glass-border)] bg-[var(--glass-highlight)] py-[0.14rem] pl-[0.42rem] pr-[0.62rem] text-[0.76rem] text-muted transition-[color,border-color,background-color] has-[input:checked]:has-[input:checked]:text-foreground [&_input]:m-0 [&_input]:accent-[var(--accent)]";

  return (
    <aside
      className={
        variant === "sheet"
          ? "flex flex-col px-[0.9rem] pb-[0.9rem] text-[0.88rem]"
          : "glass absolute right-3 top-[5.75rem] z-[5] flex max-h-[calc(100%-16rem)] w-[308px] animate-[panel-in_0.22s_ease] flex-col overflow-hidden rounded-[18px] px-[0.9rem] pb-[0.9rem] pt-3 text-[0.88rem] max-[720px]:inset-x-0 max-[720px]:bottom-0 max-[720px]:top-auto max-[720px]:max-h-[72%] max-[720px]:w-full max-[720px]:overflow-y-auto max-[720px]:overscroll-contain max-[720px]:rounded-[18px_18px_0_0]"
      }
      aria-label={t("layers")}
    >
      {/* on mobile the whole sheet scrolls as one unit (see the layer-list div
          below), so the header sticks to keep Reset/minimize reachable; the
          full-bleed padding + glass bg cover content scrolling behind it */}
      <header
        className={
          variant === "sheet"
            ? "sticky top-0 z-20 -mx-[0.9rem] mb-2 flex shrink-0 items-center justify-between bg-[var(--overlay)] px-[0.9rem] pb-2 pt-0"
            : "mb-[0.6rem] flex shrink-0 items-center justify-between max-[720px]:sticky max-[720px]:-top-4 max-[720px]:z-20 max-[720px]:-mx-[0.9rem] max-[720px]:-mt-3 max-[720px]:mb-2 max-[720px]:bg-[var(--bg)] max-[720px]:px-[0.9rem] max-[720px]:pb-2 max-[720px]:pt-3"
        }
      >
        <h2 className="m-0 text-[0.95rem] tracking-[0.02em]">{t("layers")}</h2>
        <div className="flex gap-[0.35rem]">
          <button className={panelBtn} onClick={onReset}>
            {t("reset")}
          </button>
          <button
            className={panelBtn}
            onClick={() => onMinimizedChange(true)}
            aria-label={t("minimize")}
            title={t("minimize")}
          >
            −
          </button>
        </div>
      </header>

      {/* biodiversity map: species search is the primary control — pick any
          species to see WHERE it lives (records + range outline) */}
      {onSpeciesSelect && (
        <div className="mb-3 shrink-0">
          <SpeciesSearch
            onSelect={onSpeciesSelect}
            selectedLabel={speciesLabel}
          />
          <p className="mt-1 px-1 text-[0.7rem] text-muted">
            {t("speciesHint")}
          </p>
        </div>
      )}

      {/* place search, pinned with the header, stays fixed above the scroll area */}
      <div className="mb-3 shrink-0">
        <PlaceSearch onGoTo={onGoTo} />
      </div>

      {/* /peta: upload a project boundary (KMZ/KML/DXF) to overlay + screenshot */}
      {onBoundaryLoaded && (
        <div className="mb-3 shrink-0">
          <BoundaryUpload
            onLoaded={onBoundaryLoaded}
            loadedName={boundaryName}
            onClear={onClearBoundary ?? (() => {})}
          />
        </div>
      )}

      {/* basemap switcher, stays pinned with the header above the scroll area */}
      <div
        className="mb-3 flex shrink-0 gap-[0.4rem]"
        role="radiogroup"
        aria-label={t("basemap")}
      >
        {(["dark", "satellite"] as Basemap[]).map((b) => (
          <button
            key={b}
            role="radio"
            aria-checked={filters.basemap === b}
            className={`flex-1 cursor-pointer rounded-xl border py-[0.38rem] text-[0.8rem] transition-[background-color,border-color,color] ${
              filters.basemap === b
                ? "bg-[var(--accent-dim)] text-accent"
                : "border-[var(--glass-border)] bg-[var(--glass-highlight)] text-muted hover:text-foreground"
            }`}
            onClick={() => set("basemap", b)}
          >
            {t(`basemaps.${b}`)}
          </button>
        ))}
      </div>

      {/* view mode: flat mercator / 3D globe / globe + real terrain */}
      <div
        className="mb-3 flex shrink-0 gap-[0.4rem]"
        role="radiogroup"
        aria-label={t("view")}
      >
        {VIEW_MODES.map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={filters.viewMode === v}
            title={t(`viewHints.${v}`)}
            className={`flex-1 cursor-pointer rounded-xl border py-[0.38rem] text-[0.8rem] transition-[background-color,border-color,color] ${
              filters.viewMode === v
                ? "bg-[var(--accent-dim)] text-accent"
                : "border-[var(--glass-border)] bg-[var(--glass-highlight)] text-muted hover:text-foreground"
            }`}
            onClick={() => set("viewMode", v)}
          >
            {t(`views.${v}`)}
          </button>
        ))}
      </div>

      {/* guided globe tour of the three biogeographic realms */}
      {SHOW_REALM_TOUR &&  onFlyToRealm && (
        <div className="mb-3 shrink-0">
          <div className="mb-[0.4rem] flex items-center justify-between">
            <span className="text-[0.78rem] text-muted">{t("realmTour")}</span>
            {onPlayTour && (
              <button
                className={panelBtn}
                onClick={onPlayTour}
                title={t("realmTourPlayHint")}
              >
                ▶ {t("realmTourPlay")}
              </button>
            )}
          </div>
          <div className="flex gap-[0.4rem]">
            {REALM_IDS.map((r) => (
              <button
                key={r}
                onClick={() => onFlyToRealm(r)}
                title={t(`realms.${r}.desc`)}
                className="flex-1 cursor-pointer rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] py-[0.38rem] text-[0.78rem] text-muted transition-[background-color,border-color,color] hover:border-[var(--text-dim)] hover:text-foreground"
              >
                {t(`realms.${r}.short`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* layers with per-layer sub-filters, the only part that scrolls when
          the filter list gets long (negative margin lets the scrollbar sit at
          the panel edge while content keeps its padding) */}
      <div className="-mx-[0.9rem] flex-1 overflow-y-auto px-[0.9rem] [scrollbar-width:thin] max-[720px]:mx-0 max-[720px]:flex-none max-[720px]:overflow-visible max-[720px]:px-0">
      {families && families.length > 0 && (
        <section className="border-t border-border pb-[0.6rem] pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.82rem] font-medium">
              {t("floraDiversity")}
            </span>
            {selectedFamilies && selectedFamilies.length > 0 && (
              <button className={panelBtn} onClick={onClearFamilies}>
                {t("reset")}
              </button>
            )}
          </div>
          <p className="mb-[0.5rem] mt-[0.15rem] text-[0.72rem] text-muted">
            {t("floraDiversityStat", {
              species: families.reduce((a, f) => a + f.species, 0),
              families: families.length,
            })}
          </p>
          <div className="flex flex-wrap gap-[0.35rem]">
            {families.map((f) => {
              const on =
                !selectedFamilies?.length || selectedFamilies.includes(f.family);
              const color = familyColors?.[f.family] ?? "#90a4ae";
              return (
                <button
                  key={f.family}
                  onClick={() => onToggleFamily?.(f.family)}
                  className={`inline-flex cursor-pointer select-none items-center gap-[0.3rem] rounded-full border px-[0.55rem] py-[0.16rem] text-[0.74rem] transition-[color,border-color,opacity] ${
                    on
                      ? "border-[var(--glass-border)] text-foreground"
                      : "border-transparent text-muted opacity-50"
                  }`}
                  title={`${f.species} spesies · ${f.records} catatan`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  {f.family}
                  <span className="text-muted">{f.species}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {layers.filter((def) => !HIDDEN_LAYERS.has(def.id)).map((def) => {
        const available = availableTiles.includes(def.tile);
        const active = available && filters.layers.includes(def.id);
        const sub = SUB_FILTERS[def.id];
        return (
          <section
            className={`border-t border-border pb-[0.55rem] pt-2 ${
              available ? "" : "opacity-[0.45]"
            }`}
            key={def.id}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`layer-${def.id}`}
                checked={active}
                disabled={!available}
                onChange={() => set("layers", toggleIn(filters.layers, def.id))}
              />
              <span
                className="h-3 w-3 shrink-0 rounded-[3px]"
                style={{ background: def.color }}
              />
              <label
                className="flex-1 cursor-pointer"
                htmlFor={`layer-${def.id}`}
              >
                {t(`layerNames.${def.id}`)}
                {!available && <>, {t("noData")}</>}
              </label>
            </div>

            {active && sub && (
              <div className={subFilters}>
                {sub.options.map((opt) => (
                  <label className={chip} key={opt}>
                    <input
                      type="checkbox"
                      checked={(filters[sub.key] as string[]).includes(opt)}
                      onChange={() =>
                        set(sub.key, toggleIn(filters[sub.key] as string[], opt))
                      }
                    />
                    {LAYER_SUBCOLORS[def.id] && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: swatchColor(def.id, opt) }}
                      />
                    )}
                    <span>{t(`filterValues.${opt}`)}</span>
                  </label>
                ))}
              </div>
            )}

            {active && def.id === "alerts" && (
              <div className={subFilters}>
                <div className="w-full">
                  <label
                    className="mb-[0.3rem] block text-[0.78rem] text-muted"
                    htmlFor="days-back"
                  >
                    {t("daysBack")}: {filters.days}
                  </label>
                  <input
                    id="days-back"
                    type="range"
                    min={7}
                    max={90}
                    step={1}
                    value={filters.days}
                    onChange={(e) => set("days", Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            <a
              className="mt-1 block pl-[1.7rem] text-[0.72rem] text-muted"
              href={def.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("source")}: {def.sourceName}
            </a>
          </section>
        );
      })}
      </div>
    </aside>
  );
}
