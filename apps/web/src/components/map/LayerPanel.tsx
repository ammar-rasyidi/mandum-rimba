"use client";

import { useState } from "react";
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
}

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
}: Props) {
  const t = useTranslations("map");
  const [minimized, setMinimized] = useState(false);

  if (minimized) {
    return (
      <button
        className="glass absolute right-3 top-[5.75rem] z-[5] cursor-pointer rounded-full px-[1.1rem] py-[0.55rem] text-[0.85rem] text-foreground transition-[transform,border-color] hover:-translate-y-px max-[720px]:bottom-5 max-[720px]:top-auto"
        onClick={() => setMinimized(false)}
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
      className="glass absolute right-3 top-[5.75rem] z-[5] flex max-h-[calc(100%-16rem)] w-[308px] animate-[panel-in_0.22s_ease] flex-col overflow-hidden rounded-[18px] px-[0.9rem] pb-[0.9rem] pt-3 text-[0.88rem] max-[720px]:inset-x-0 max-[720px]:bottom-0 max-[720px]:top-auto max-[720px]:max-h-[48%] max-[720px]:w-full max-[720px]:rounded-[18px_18px_0_0]"
      aria-label={t("layers")}
    >
      <header className="mb-[0.6rem] flex shrink-0 items-center justify-between">
        <h2 className="m-0 text-[0.95rem] tracking-[0.02em]">{t("layers")}</h2>
        <div className="flex gap-[0.35rem]">
          <button className={panelBtn} onClick={onReset}>
            {t("reset")}
          </button>
          <button
            className={panelBtn}
            onClick={() => setMinimized(true)}
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

      {/* layers with per-layer sub-filters, the only part that scrolls when
          the filter list gets long (negative margin lets the scrollbar sit at
          the panel edge while content keeps its padding) */}
      <div className="-mx-[0.9rem] flex-1 overflow-y-auto px-[0.9rem] [scrollbar-width:thin]">
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
