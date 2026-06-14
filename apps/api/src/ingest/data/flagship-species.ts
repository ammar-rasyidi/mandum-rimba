/**
 * Curated flagship threatened species whose habitat is under pressure from
 * deforestation, palm/pulp expansion, and mining — the animals at the heart of
 * Mandum Rimba's mission.
 *
 * Every field is a citable public fact, not an estimate:
 *  - `iucnStatus` and `iucnAssessmentUrl`: the IUCN Red List assessment. For
 *    full species GBIF confirmed the category live (CR/EN/VU). For the two
 *    Indonesian subspecies (Sumatran tiger, Sumatran elephant) GBIF has no
 *    subspecies category, so the status is taken from the subspecies' own IUCN
 *    assessment (both Critically Endangered) and the URL points to the IUCN
 *    search so anyone can verify.
 *  - `gbifTaxonKey`: GBIF backbone identifier (verified, occurrence counts in
 *    comments are georeferenced Indonesian records at time of curation).
 *  - `habitatEcoregions`: RESOLVE 2017 ecoregion names (verified to exist in
 *    the UNEP-WCMC service) that the species is documented to depend on.
 */
export interface FlagshipSpecies {
  slug: string;
  scientificName: string;
  commonNameId: string;
  commonNameEn: string;
  iucnStatus: "CR" | "EN" | "VU";
  iucnAssessmentUrl: string;
  gbifTaxonKey: number;
  habitatEcoregions: string[];
  islandGroup: string;
}

const iucnSearch = (name: string) =>
  `https://www.iucnredlist.org/search?query=${encodeURIComponent(name)}&searchType=species`;

export const FLAGSHIP_SPECIES: FlagshipSpecies[] = [
  {
    slug: "orangutan-sumatra",
    scientificName: "Pongo abelii",
    commonNameId: "Orangutan Sumatra",
    commonNameEn: "Sumatran orangutan",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Pongo abelii"),
    gbifTaxonKey: 5707420, // ~598 IDN records
    habitatEcoregions: [
      "Sumatran lowland rain forests",
      "Sumatran montane rain forests",
      "Sumatran peat swamp forests",
    ],
    islandGroup: "Sumatera",
  },
  {
    slug: "orangutan-kalimantan",
    scientificName: "Pongo pygmaeus",
    commonNameId: "Orangutan Kalimantan",
    commonNameEn: "Bornean orangutan",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Pongo pygmaeus"),
    gbifTaxonKey: 5219532, // ~658 IDN records
    habitatEcoregions: [
      "Borneo lowland rain forests",
      "Borneo peat swamp forests",
      "Borneo montane rain forests",
      "Southwest Borneo freshwater swamp forests",
    ],
    islandGroup: "Kalimantan",
  },
  {
    slug: "orangutan-tapanuli",
    scientificName: "Pongo tapanuliensis",
    commonNameId: "Orangutan Tapanuli",
    commonNameEn: "Tapanuli orangutan",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Pongo tapanuliensis"),
    gbifTaxonKey: 9311132, // ~5 IDN records (rarest great ape)
    habitatEcoregions: ["Sumatran montane rain forests"],
    islandGroup: "Sumatera",
  },
  {
    slug: "harimau-sumatra",
    scientificName: "Panthera tigris sondaica",
    commonNameId: "Harimau Sumatra",
    commonNameEn: "Sumatran tiger",
    iucnStatus: "CR", // subspecies assessment (species P. tigris is EN)
    iucnAssessmentUrl: iucnSearch("Panthera tigris sondaica"),
    gbifTaxonKey: 5219422, // ~38 IDN records
    habitatEcoregions: [
      "Sumatran lowland rain forests",
      "Sumatran montane rain forests",
      "Sumatran peat swamp forests",
    ],
    islandGroup: "Sumatera",
  },
  {
    slug: "gajah-sumatra",
    scientificName: "Elephas maximus sumatranus",
    commonNameId: "Gajah Sumatra",
    commonNameEn: "Sumatran elephant",
    iucnStatus: "CR", // subspecies assessment (species E. maximus is EN)
    iucnAssessmentUrl: iucnSearch("Elephas maximus sumatranus"),
    gbifTaxonKey: 5219463, // ~43 IDN records
    habitatEcoregions: [
      "Sumatran lowland rain forests",
      "Sumatran peat swamp forests",
    ],
    islandGroup: "Sumatera",
  },
  {
    slug: "badak-jawa",
    scientificName: "Rhinoceros sondaicus",
    commonNameId: "Badak Jawa",
    commonNameEn: "Javan rhinoceros",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Rhinoceros sondaicus"),
    gbifTaxonKey: 5220112, // ~21 IDN records (Ujung Kulon only)
    habitatEcoregions: ["Western Java rain forests"],
    islandGroup: "Jawa",
  },
  {
    slug: "badak-sumatra",
    scientificName: "Dicerorhinus sumatrensis",
    commonNameId: "Badak Sumatra",
    commonNameEn: "Sumatran rhinoceros",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Dicerorhinus sumatrensis"),
    gbifTaxonKey: 2440878, // ~4 IDN records
    habitatEcoregions: [
      "Sumatran lowland rain forests",
      "Sumatran montane rain forests",
      "Borneo lowland rain forests",
    ],
    islandGroup: "Sumatera",
  },
  {
    slug: "bekantan",
    scientificName: "Nasalis larvatus",
    commonNameId: "Bekantan",
    commonNameEn: "Proboscis monkey",
    iucnStatus: "EN",
    iucnAssessmentUrl: iucnSearch("Nasalis larvatus"),
    gbifTaxonKey: 2436525, // ~322 IDN records
    habitatEcoregions: [
      "Borneo peat swamp forests",
      "Southwest Borneo freshwater swamp forests",
    ],
    islandGroup: "Kalimantan",
  },
  {
    slug: "beruang-madu",
    scientificName: "Helarctos malayanus",
    commonNameId: "Beruang madu",
    commonNameEn: "Sun bear",
    iucnStatus: "VU",
    iucnAssessmentUrl: iucnSearch("Helarctos malayanus"),
    gbifTaxonKey: 2433403, // ~122 IDN records
    habitatEcoregions: [
      "Sumatran lowland rain forests",
      "Borneo lowland rain forests",
    ],
    islandGroup: "Sumatera & Kalimantan",
  },
  {
    slug: "owa-jawa",
    scientificName: "Hylobates moloch",
    commonNameId: "Owa Jawa",
    commonNameEn: "Javan gibbon",
    iucnStatus: "EN",
    iucnAssessmentUrl: iucnSearch("Hylobates moloch"),
    gbifTaxonKey: 5219552, // ~167 IDN records
    habitatEcoregions: [
      "Western Java rain forests",
      "Western Java montane rain forests",
    ],
    islandGroup: "Jawa",
  },
];

/** all RESOLVE ecoregions referenced as flagship habitat (for the habitat job) */
export const HABITAT_ECOREGION_NAMES: string[] = [
  ...new Set(FLAGSHIP_SPECIES.flatMap((s) => s.habitatEcoregions)),
];
