# Species distribution (Peta sebaran satwa)

Builds the species-richness grid for the map's "Sebaran satwa" layer from
public data. Endemic Indonesian species, occurrences from GBIF, aggregated into
a 0.5 degree grid coloured by how many endemic species are recorded per cell.

Sources:
- Endemic species lists: Wikipedia "List of endemic ... of Indonesia"
  (referenced to BirdLife / IOC), cross-checked against authoritative class
  databases (Reptile Database, AmphibiaWeb, Mammal Diversity Database).
- Occurrences and taxonomy: GBIF (CC BY). Endemism classification: IUCN.
- IUCN range polygons are NOT used (their licence forbids redistribution); this
  is an occurrence-derived distribution, stated as such.

Pipeline (birds prototype):
1. extract_birds.py  -> endemic bird binomials from Wikipedia
2. match_birds.py    -> match names to GBIF taxonKeys (class Aves)
3. build_grid.py     -> fetch GBIF occurrences, bin to a 0.5 deg richness grid,
                        write species-distribution-birds.geojson

Output goes to apps/web/public/data/. To scale to reptiles, amphibians and
mammals, repeat with each class list and merge, adding a class property per cell
for the layer's class filter.
