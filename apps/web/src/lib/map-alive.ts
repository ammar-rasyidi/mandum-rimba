import type maplibregl from "maplibre-gl";

/**
 * Is this map still usable, i.e. not remove()d?
 *
 * A removed MapLibre map is still a live JS object with all of its methods.
 * What remove() takes away is `style`, and every accessor that reaches through
 * it (getLayer, getSource, setPaintProperty, setLayoutProperty) then throws
 * "Cannot read properties of undefined". So neither `if (map)` nor `map?.` can
 * see the problem: both only prove the reference exists.
 *
 * isStyleLoaded() is the one public method that separates the two states. It
 * returns a boolean whenever a style is present, loaded or not, and undefined
 * only once the style has been torn down.
 *
 * That distinction is the point, and it must not be collapsed into "wait until
 * the style has loaded". Gating the air field on the loading case is exactly
 * what once left that layer never appearing, because one 404ing tile source
 * keeps the map from ever settling (see the AirField note in CLAUDE.md).
 *
 * Written as a type predicate so `if (!mapAlive(m)) return;` also narrows a
 * nullable reference away for everything below it.
 */
export function mapAlive(
  m?: maplibregl.Map | null,
): m is maplibregl.Map {
  return !!m && m.isStyleLoaded() !== undefined;
}
