/**
 * The single source of truth for the Data Sources page: every dataset shown on
 * the map, plus the honest gaps where credible open data does not exist. Keep
 * this in sync with the ingest jobs, anyone must be able to independently
 * verify each source via its URL.
 */
export interface Bilingual {
  id: string;
  en: string;
}

export interface DatasetEntry {
  /** map layer this powers, or null for context/gap rows */
  layer: string | null;
  name: Bilingual;
  org: string;
  url: string;
  license: string;
  updated: string;
  coverage: Bilingual;
  description: Bilingual;
  status: "active" | "gap";
}

export const DATA_CATALOG: DatasetEntry[] = [
  {
    layer: "alerts",
    name: {
      id: "Peringatan deforestasi (RADD, GLAD-L, GLAD-S2)",
      en: "Deforestation alerts (RADD, GLAD-L, GLAD-S2)",
    },
    org: "Global Forest Watch, Wageningen University & University of Maryland",
    url: "https://data-api.globalforestwatch.org",
    license: "CC BY 4.0",
    updated: "Harian / Daily",
    coverage: { id: "Indonesia (per kabupaten)", en: "Indonesia (by district)" },
    description: {
      id: "Titik peringatan pembukaan hutan hampir waktu-nyata dari radar dan optik satelit, resolusi 10–30 m.",
      en: "Near-real-time forest-clearing alert points from satellite radar and optical sensors, 10–30 m resolution.",
    },
    status: "active",
  },
  {
    layer: null,
    name: {
      id: "Kehilangan tutupan pohon tahunan (Hansen/UMD)",
      en: "Annual tree cover loss (Hansen/UMD)",
    },
    org: "University of Maryland via Global Forest Watch",
    url: "https://data-api.globalforestwatch.org/dataset/umd_tree_cover_loss",
    license: "CC BY 4.0",
    updated: "Tahunan / Annual",
    coverage: { id: "Indonesia (per wilayah)", en: "Indonesia (per region)" },
    description: {
      id: "Kehilangan tutupan pohon per tahun (≥30% kerapatan kanopi) yang diagregasi per wilayah; menggerakkan grafik halaman wilayah.",
      en: "Per-year tree cover loss (≥30% canopy density) aggregated by region; powers the region-page chart.",
    },
    status: "active",
  },
  {
    layer: "concessions",
    name: {
      id: "Konsesi sawit / HTI / logging",
      en: "Oil palm / pulpwood / logging concessions",
    },
    org: "Global Forest Watch (data turunan Greenpeace)",
    url: "https://data.globalforestwatch.org/search?q=Indonesia%20concessions",
    license: "CC BY 4.0",
    updated: "gfw_oil_palm v2025 · gfw_wood_fiber v2025 · gfw_logging v202106",
    coverage: { id: "Indonesia", en: "Indonesia" },
    description: {
      id: "Batas konsesi sawit (1.855), HTI/pulp (295), dan logging (259) di Indonesia.",
      en: "Concession boundaries for oil palm (1,855), pulpwood (295), and logging (259) in Indonesia.",
    },
    status: "active",
  },
  {
    layer: "protected",
    name: {
      id: "Kawasan lindung & moratorium hutan",
      en: "Protected areas & forest moratorium",
    },
    org: "Protected Planet (WDPA) + KLHK PIPPIB, via GFW",
    url: "https://www.protectedplanet.net",
    license: "WDPA terms · PIPPIB CC BY 4.0",
    updated: "wdpa v202512 · pippib v20200923",
    coverage: { id: "Indonesia", en: "Indonesia" },
    description: {
      id: "688 kawasan lindung WDPA dan 42.027 poligon moratorium hutan KLHK (PIPPIB).",
      en: "688 WDPA protected areas and 42,027 KLHK forest moratorium (PIPPIB) polygons.",
    },
    status: "active",
  },
  {
    layer: "concessions",
    name: {
      id: "Tambang, jejak lahan (Maus et al. 2022)",
      en: "Mining, land footprint (Maus et al. 2022)",
    },
    org: "Maus et al., Scientific Data (Nature), via GFW · PANGAEA",
    url: "https://doi.org/10.1594/PANGAEA.942325",
    license: "CC BY 4.0",
    updated: "v2 (2022)",
    coverage: { id: "Seluruh Indonesia, 1.448 poligon (~8.020 km²): a.l. batu bara Kalimantan, nikel Sulawesi/Maluku, Papua", en: "All Indonesia, 1,448 polygons (~8,020 km²): incl. Kalimantan coal, Sulawesi/Maluku nickel, Papua" },
    description: {
      id: "Lahan tambang yang dipetakan dari citra satelit, jejak fisik pertambangan untuk SEMUA jenis mineral, dari Aceh hingga Papua, telah melalui telaah sejawat. Ini sumber data tambang utama kami (bukan batas izin).",
      en: "Satellite-mapped mined land, the physical footprint of mining for ALL minerals, Aceh to Papua, peer-reviewed. This is our primary mining dataset (not permit boundaries).",
    },
    status: "active",
  },
  {
    layer: "habitat",
    name: {
      id: "Habitat satwa, Ekoregion RESOLVE 2017",
      en: "Wildlife habitat, RESOLVE Ecoregions 2017",
    },
    org: "RESOLVE / Dinerstein et al. (BioScience), via UNEP-WCMC",
    url: "https://data-gis.unep-wcmc.org/server/rest/services/Bio-geographicalRegions/Resolve_Ecoregions/FeatureServer/0",
    license: "CC BY 4.0",
    updated: "2017",
    coverage: { id: "Ekoregion habitat satwa unggulan (9 ekoregion)", en: "Habitat ecoregions of the flagship species (9 ecoregions)" },
    description: {
      id: "Unit habitat yang diakui ilmiah (mis. ‘Sumatran lowland rain forests’) yang dihuni satwa unggulan, ditampilkan sebagai ekoregion habitat, bukan sebaran persis tiap individu.",
      en: "Scientifically-recognized habitat units (e.g. ‘Sumatran lowland rain forests’) the flagship species depend on, shown as habitat ecoregions, not a precise per-individual range.",
    },
    status: "active",
  },
  {
    layer: "species",
    name: {
      id: "Catatan keberadaan satwa dilindungi (GBIF + IUCN + pemerintah)",
      en: "Protected-wildlife occurrence records (GBIF + IUCN + government)",
    },
    org: "GBIF (titik perjumpaan) · IUCN Red List (status) · Permen LHK P.106/2018, KKP & CITES (status dilindungi)",
    url: "https://www.gbif.org",
    license: "GBIF per-dataset (CC0 / CC BY / CC BY-NC); status: IUCN Red List",
    updated: "Live API",
    coverage: {
      id: "30 spesies unggulan dari Sumatera sampai Papua, darat, laut & perairan (mamalia, burung, reptil, ikan), ~7.300 catatan",
      en: "30 flagship species from Sumatra to Papua, land, sea & freshwater (mammals, birds, reptiles, fish), ~7,300 records",
    },
    description: {
      id: "Titik catatan keberadaan satwa (‘tercatat di sini’) dari GBIF (1990–kini), BUKAN batas habitat. Daftar spesies dipilih dari satwa yang DILINDUNGI hukum Indonesia (Permen LHK P.106/2018), peraturan KKP untuk satwa laut, dan CITES, sengaja mewakili tiap wilayah dan ekosistem: Sundaland, Wallacea (anoa, maleo, komodo), Papua (kanguru pohon, nokdiak), serta laut & sungai (penyu, hiu paus, dugong, pesut). Status keterancaman mengikuti IUCN Red List; sebagian dilindungi walau status IUCN-nya belum terancam (mis. penyu hijau). Disaring ke catatan bergeoreferensi tanpa masalah spasial, lalu koordinat tiap titik divalidasi terhadap peta daratan Indonesia dan realm spesiesnya, sehingga satwa laut yang salah terplot di darat (atau satwa darat di tengah laut) dibuang.",
      en: "Occurrence points (‘recorded here’) from GBIF (1990–present), NOT habitat boundaries. Species are drawn from those PROTECTED under Indonesian law (Minister of Environment & Forestry Reg. P.106/2018), KKP marine regulations, and CITES, deliberately spanning every region and ecosystem: Sundaland, Wallacea (anoa, maleo, Komodo), Papua (tree-kangaroo, echidna), and the sea & rivers (turtles, whale shark, dugong, Irrawaddy dolphin). Threat status follows the IUCN Red List; some are protected even where their IUCN status isn't threatened (e.g. green turtle). Filtered to georeferenced records with no geospatial issues, then each point's coordinates are validated against an Indonesia land mask and the species' realm, so marine animals mis-plotted on land (or land animals out at sea) are dropped.",
    },
    status: "active",
  },
  {
    layer: "disasters",
    name: { id: "Bencana banjir & longsor (BNPB DIBI)", en: "Flood & landslide disasters (BNPB DIBI)" },
    org: "BNPB DIBI, via UNDRR DesInventar",
    url: "https://www.desinventar.net/DesInventar/profiletab.jsp?countrycode=idn",
    license: "Publik / Public",
    updated: "Harian (cek perubahan) / Daily (change-checked)",
    coverage: { id: "Indonesia (titik per kabupaten)", en: "Indonesia (kabupaten centroids)" },
    description: {
      id: "Kejadian banjir/longsor tingkat peristiwa dari cermin resmi UNDRR atas basis data DIBI. Lokasi adalah centroid kabupaten (pendekatan), bukan titik persis.",
      en: "Event-level flood/landslide records from the UNDRR mirror of DIBI. Location is the kabupaten centroid (an approximation), not the exact point.",
    },
    status: "active",
  },
  {
    layer: null,
    name: { id: "Batas wilayah administratif", en: "Administrative boundaries" },
    org: "GADM 4.1",
    url: "https://gadm.org",
    license: "Non-komersial / Non-commercial",
    updated: "v4.1",
    coverage: { id: "Indonesia (provinsi & kabupaten)", en: "Indonesia (provinces & districts)" },
    description: {
      id: "Batas provinsi dan kabupaten yang menjadi dasar peta dan agregasi.",
      en: "Province and district boundaries underpinning the map and aggregations.",
    },
    status: "active",
  },
];

/** Honest gaps: credible open data we could NOT obtain, with the recommended
 *  provider so users know where the real source lives. */
export const DATA_GAPS: DatasetEntry[] = [
  {
    layer: "mining",
    name: { id: "Batas konsesi/izin tambang (IUP)", en: "Mining concession / permit boundaries (IUP)" },
    org: "ESDM Minerba One Map Indonesia (MOMI)",
    url: "https://momi.minerba.esdm.go.id/public/",
    license: "-",
    updated: "-",
    coverage: { id: "Tidak tersedia terbuka (terkunci login)", en: "Not openly available (login-locked)" },
    description: {
      id: "MOMI memuat 10.338 IUP resmi, namun layanan petanya terkunci login (hanya blok lelang yang publik); GFW tidak punya baris tambang Indonesia, dan Global Energy Monitor hanya batu bara via formulir. Maka batas konsesi tambang tidak bisa kami sajikan. Sebagai gantinya, JEJAK lahan tambang (Maus, semua mineral) sudah ditampilkan. Bila Anda memperoleh GeoJSON IUP yang kredibel, dapat dimuat lewat MINING_IUP_GEOJSON_URL.",
      en: "MOMI holds 10,338 official IUPs but its map service is login-locked (only auction blocks are public); GFW has no Indonesian mining rows, and Global Energy Monitor is coal-only behind a form. So concession boundaries cannot be served. Instead, the mining land FOOTPRINT (Maus, all minerals) is already shown. If you obtain a credible IUP GeoJSON, it can be loaded via MINING_IUP_GEOJSON_URL.",
    },
    status: "gap",
  },
  {
    layer: "habitat",
    name: { id: "Sebaran resmi spesies (poligon IUCN)", en: "Official species range polygons (IUCN)" },
    org: "IUCN Red List spatial data",
    url: "https://www.iucnredlist.org/resources/spatial-data-download",
    license: "Non-commercial, redistribution restricted",
    updated: "-",
    coverage: { id: "Perlu registrasi & perjanjian lisensi", en: "Requires registration & license agreement" },
    description: {
      id: "Poligon sebaran resmi IUCN butuh token + perjanjian dan membatasi redistribusi, sehingga tidak bisa kami sajikan langsung. Sebagai alternatif terbuka, kami pakai ekoregion habitat (RESOLVE) + titik keberadaan (GBIF).",
      en: "IUCN's authoritative range polygons require a token + agreement and restrict redistribution, so we cannot serve them directly. As an open alternative we use habitat ecoregions (RESOLVE) + occurrence points (GBIF).",
    },
    status: "gap",
  },
  {
    layer: null,
    name: { id: "Kawasan Kunci Keanekaragaman Hayati (KBA)", en: "Key Biodiversity Areas (KBA)" },
    org: "KBA Partnership / BirdLife International",
    url: "https://www.keybiodiversityareas.org",
    license: "Data request required",
    updated: "-",
    coverage: { id: "Belum terintegrasi", en: "Not yet integrated" },
    description: {
      id: "Batas KBA memerlukan permintaan data formal; belum ada endpoint terbuka. Penyedia: KBA Partnership / BirdLife.",
      en: "KBA boundaries require a formal data request; no open endpoint. Provider: KBA Partnership / BirdLife.",
    },
    status: "gap",
  },
  {
    layer: null,
    name: { id: "Titik panas keanekaragaman hayati", en: "Biodiversity hotspots" },
    org: "Conservation International / CEPF",
    url: "https://www.cepf.net/our-work/biodiversity-hotspots",
    license: "-",
    updated: "-",
    coverage: { id: "Sundaland & Wallacea (verifikasi sumber tertunda)", en: "Sundaland & Wallacea (source verification pending)" },
    description: {
      id: "Batas hotspot Sundaland & Wallacea mencakup Indonesia, namun unduhan terbuka yang stabil belum terverifikasi. Penyedia: Conservation International / CEPF.",
      en: "The Sundaland & Wallacea hotspot boundaries cover Indonesia, but a stable open download is not yet verified. Provider: Conservation International / CEPF.",
    },
    status: "gap",
  },
];
