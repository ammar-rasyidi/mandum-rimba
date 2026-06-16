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
  // IUCN Red List category. CR/EN/VU are "threatened"; NT/LC are included only
  // for species that Indonesian law / CITES protects regardless of IUCN status.
  iucnStatus: "CR" | "EN" | "VU" | "NT" | "LC";
  iucnAssessmentUrl: string;
  gbifTaxonKey: number;
  habitatEcoregions: string[];
  islandGroup: string;
}

const iucnSearch = (name: string) =>
  `https://www.iucnredlist.org/search?query=${encodeURIComponent(name)}&searchType=species`;

/**
 * Ecological realm — drives land/sea coordinate validation so GBIF noise
 * (a turtle plotted inland, a bear plotted offshore) is dropped.
 *   sea     — open water / reef (whale shark, manta, napoleon, dugong)
 *   coastal — beach + sea (turtles): keep near the coast, drop deep inland
 *   any     — river + coast (pesut): no land/sea filter
 *   land    — everything else (terrestrial)
 */
export type SpeciesRealm = "land" | "sea" | "coastal" | "any";

const SEA_SLUGS = new Set(["hiu-paus", "pari-manta", "ikan-napoleon", "dugong"]);
const COASTAL_SLUGS = new Set([
  "penyu-sisik",
  "penyu-belimbing",
  "penyu-hijau",
]);

export function realmOf(slug: string): SpeciesRealm {
  if (SEA_SLUGS.has(slug)) return "sea";
  if (COASTAL_SLUGS.has(slug)) return "coastal";
  if (slug === "pesut") return "any";
  return "land";
}

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

  // ── Wallacea: Sulawesi ──
  {
    slug: "yaki",
    scientificName: "Macaca nigra",
    commonNameId: "Yaki (Monyet hitam Sulawesi)",
    commonNameEn: "Celebes crested macaque",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Macaca nigra"),
    gbifTaxonKey: 2436616, // ~385 IDN records
    habitatEcoregions: [
      "Sulawesi lowland rain forests",
      "Sulawesi montane rain forests",
    ],
    islandGroup: "Sulawesi",
  },
  {
    slug: "maleo",
    scientificName: "Macrocephalon maleo",
    commonNameId: "Maleo",
    commonNameEn: "Maleo",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Macrocephalon maleo"),
    gbifTaxonKey: 2482154, // ~641 IDN records
    habitatEcoregions: [
      "Sulawesi lowland rain forests",
      "Sulawesi montane rain forests",
    ],
    islandGroup: "Sulawesi",
  },
  {
    slug: "anoa",
    scientificName: "Bubalus depressicornis",
    commonNameId: "Anoa dataran rendah",
    commonNameEn: "Lowland anoa",
    iucnStatus: "EN",
    iucnAssessmentUrl: iucnSearch("Bubalus depressicornis"),
    gbifTaxonKey: 8085503, // ~31 IDN records
    habitatEcoregions: [
      "Sulawesi lowland rain forests",
      "Sulawesi montane rain forests",
    ],
    islandGroup: "Sulawesi",
  },
  {
    slug: "babirusa",
    scientificName: "Babyrousa celebensis",
    commonNameId: "Babirusa Sulawesi",
    commonNameEn: "North Sulawesi babirusa",
    iucnStatus: "VU",
    iucnAssessmentUrl: iucnSearch("Babyrousa celebensis"),
    gbifTaxonKey: 4262912, // ~43 IDN records
    habitatEcoregions: ["Sulawesi lowland rain forests"],
    islandGroup: "Sulawesi",
  },
  {
    slug: "tarsius",
    scientificName: "Tarsius tarsier",
    commonNameId: "Tarsius",
    commonNameEn: "Spectral tarsier",
    iucnStatus: "VU",
    iucnAssessmentUrl: iucnSearch("Tarsius tarsier"),
    gbifTaxonKey: 4266949, // ~21 IDN records
    habitatEcoregions: ["Sulawesi lowland rain forests"],
    islandGroup: "Sulawesi",
  },

  // ── Wallacea: Nusa Tenggara & Bali ──
  {
    slug: "komodo",
    scientificName: "Varanus komodoensis",
    commonNameId: "Komodo",
    commonNameEn: "Komodo dragon",
    iucnStatus: "EN",
    iucnAssessmentUrl: iucnSearch("Varanus komodoensis"),
    gbifTaxonKey: 2470854, // ~1061 IDN records
    habitatEcoregions: ["Lesser Sundas deciduous forests"],
    islandGroup: "Nusa Tenggara",
  },
  {
    slug: "jalak-bali",
    scientificName: "Leucopsar rothschildi",
    commonNameId: "Jalak Bali",
    commonNameEn: "Bali myna",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Leucopsar rothschildi"),
    gbifTaxonKey: 2489068, // ~458 IDN records
    habitatEcoregions: ["Eastern Java-Bali rain forests"],
    islandGroup: "Bali",
  },

  // ── Maluku ──
  {
    slug: "kakatua-maluku",
    scientificName: "Cacatua moluccensis",
    commonNameId: "Kakatua Maluku",
    commonNameEn: "Salmon-crested cockatoo",
    iucnStatus: "EN",
    iucnAssessmentUrl: iucnSearch("Cacatua moluccensis"),
    gbifTaxonKey: 2479898, // ~32 IDN records
    habitatEcoregions: ["Seram rain forests"],
    islandGroup: "Maluku",
  },

  // ── Papua ──
  {
    slug: "kanguru-pohon",
    scientificName: "Dendrolagus inustus",
    commonNameId: "Kanguru pohon kelabu",
    commonNameEn: "Grizzled tree-kangaroo",
    iucnStatus: "VU",
    iucnAssessmentUrl: iucnSearch("Dendrolagus inustus"),
    gbifTaxonKey: 2440217, // ~12 IDN records
    habitatEcoregions: [
      "Vogelkop montane rain forests",
      "Vogelkop-Aru lowland rain forests",
    ],
    islandGroup: "Papua",
  },
  {
    slug: "nuri-pesquet",
    scientificName: "Psittrichas fulgidus",
    commonNameId: "Nuri Pesquet (Kasturi raja)",
    commonNameEn: "Pesquet's parrot",
    iucnStatus: "VU",
    iucnAssessmentUrl: iucnSearch("Psittrichas fulgidus"),
    gbifTaxonKey: 2479860, // ~50 IDN records
    habitatEcoregions: ["Central Range montane rain forests"],
    islandGroup: "Papua",
  },
  {
    slug: "nokdiak",
    scientificName: "Zaglossus bruijnii",
    commonNameId: "Nokdiak moncong panjang",
    commonNameEn: "Western long-beaked echidna",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Zaglossus bruijnii"),
    gbifTaxonKey: 2433391, // ~32 IDN records
    habitatEcoregions: ["Vogelkop montane rain forests"],
    islandGroup: "Papua",
  },

  // ── Satwa laut & perairan (dilindungi: Permen LHK / KKP / CITES) ──
  // habitatEcoregions empty: RESOLVE units are terrestrial, so marine ranges
  // are not represented there (honest gap, not fabricated).
  {
    slug: "penyu-sisik",
    scientificName: "Eretmochelys imbricata",
    commonNameId: "Penyu sisik",
    commonNameEn: "Hawksbill turtle",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Eretmochelys imbricata"),
    gbifTaxonKey: 8841716, // ~1018 IDN records
    habitatEcoregions: [],
    islandGroup: "Perairan Indonesia",
  },
  {
    slug: "penyu-belimbing",
    scientificName: "Dermochelys coriacea",
    commonNameId: "Penyu belimbing",
    commonNameEn: "Leatherback turtle",
    iucnStatus: "VU",
    iucnAssessmentUrl: iucnSearch("Dermochelys coriacea"),
    gbifTaxonKey: 9789983, // ~117 IDN records
    habitatEcoregions: [],
    islandGroup: "Perairan Indonesia",
  },
  {
    slug: "penyu-hijau",
    scientificName: "Chelonia mydas",
    commonNameId: "Penyu hijau",
    commonNameEn: "Green turtle",
    iucnStatus: "LC", // IUCN global LC, tapi dilindungi UU & CITES App. I
    iucnAssessmentUrl: iucnSearch("Chelonia mydas"),
    gbifTaxonKey: 2442225, // ~1320 IDN records
    habitatEcoregions: [],
    islandGroup: "Perairan Indonesia",
  },
  {
    slug: "hiu-paus",
    scientificName: "Rhincodon typus",
    commonNameId: "Hiu paus",
    commonNameEn: "Whale shark",
    iucnStatus: "EN",
    iucnAssessmentUrl: iucnSearch("Rhincodon typus"),
    gbifTaxonKey: 2417522, // ~585 IDN records
    habitatEcoregions: [],
    islandGroup: "Perairan Indonesia",
  },
  {
    slug: "pari-manta",
    scientificName: "Mobula birostris",
    commonNameId: "Pari manta oseanik",
    commonNameEn: "Oceanic manta ray",
    iucnStatus: "EN",
    iucnAssessmentUrl: iucnSearch("Mobula birostris"),
    gbifTaxonKey: 9548142, // ~134 IDN records
    habitatEcoregions: [],
    islandGroup: "Perairan Indonesia",
  },
  {
    slug: "ikan-napoleon",
    scientificName: "Cheilinus undulatus",
    commonNameId: "Ikan napoleon",
    commonNameEn: "Humphead (Napoleon) wrasse",
    iucnStatus: "EN",
    iucnAssessmentUrl: iucnSearch("Cheilinus undulatus"),
    gbifTaxonKey: 2383313, // ~417 IDN records
    habitatEcoregions: [],
    islandGroup: "Perairan Indonesia",
  },
  {
    slug: "dugong",
    scientificName: "Dugong dugon",
    commonNameId: "Dugong",
    commonNameEn: "Dugong",
    iucnStatus: "VU",
    iucnAssessmentUrl: iucnSearch("Dugong dugon"),
    gbifTaxonKey: 9729967, // ~26 IDN records
    habitatEcoregions: [],
    islandGroup: "Perairan Indonesia",
  },
  {
    slug: "pesut",
    scientificName: "Orcaella brevirostris",
    commonNameId: "Pesut (Lumba-lumba Irrawaddy)",
    commonNameEn: "Irrawaddy dolphin",
    iucnStatus: "EN",
    iucnAssessmentUrl: iucnSearch("Orcaella brevirostris"),
    gbifTaxonKey: 2440460, // ~3 IDN records (mis. Mahakam)
    habitatEcoregions: [],
    islandGroup: "Sungai & pesisir",
  },

  // ── Trenggiling (dilindungi; tersebar di Indonesia barat) ──
  {
    slug: "trenggiling",
    scientificName: "Manis javanica",
    commonNameId: "Trenggiling",
    commonNameEn: "Sunda pangolin",
    iucnStatus: "CR",
    iucnAssessmentUrl: iucnSearch("Manis javanica"),
    gbifTaxonKey: 5219628, // ~42 IDN records
    habitatEcoregions: [
      "Sumatran lowland rain forests",
      "Borneo lowland rain forests",
    ],
    islandGroup: "Sumatera, Kalimantan & Jawa",
  },
];

/** all RESOLVE ecoregions referenced as flagship habitat (for the habitat job) */
export const HABITAT_ECOREGION_NAMES: string[] = [
  ...new Set(FLAGSHIP_SPECIES.flatMap((s) => s.habitatEcoregions)),
];
