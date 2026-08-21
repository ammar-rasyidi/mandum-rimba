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
    layer: "forestloss",
    name: {
      id: "Kehilangan tutupan pohon (Hansen/UMD, 2001–2025)",
      en: "Tree cover loss (Hansen/UMD, 2001–2025)",
    },
    org: "University of Maryland via Global Forest Watch",
    url: "https://data-api.globalforestwatch.org/dataset/umd_tree_cover_loss",
    license: "CC BY 4.0",
    updated: "Tahunan / Annual (2001–2025)",
    coverage: { id: "Indonesia (resolusi 30 m)", en: "Indonesia (30 m resolution)" },
    description: {
      id: "Kehilangan tutupan pohon tahunan (>30% kerapatan kanopi) resolusi 30 m. Di peta tampil sebagai lapisan raster pixel langsung dari ubin GFW, diwarnai per kepadatan (amber → merah tua) dengan lini masa 2001–2025; juga diagregasi per wilayah untuk grafik halaman wilayah. Kehilangan tutupan pohon tak selalu berarti deforestasi.",
      en: "Annual tree cover loss (>30% canopy density) at 30 m resolution. On the map it's a pixel raster streamed live from GFW's tiles, coloured by density (amber → deep red) with a 2001–2025 timeline; also aggregated by region for the region-page chart. Tree cover loss is not always deforestation.",
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
    org: "Protected Planet (WDPA), UNEP-WCMC & IUCN + KLHK PIPPIB, via GFW",
    url: "https://www.protectedplanet.net",
    license: "WDPA: tampil non-komersial + atribusi, tanpa unduhan / non-commercial display + attribution, no downloads · PIPPIB CC BY 4.0",
    updated: "wdpa v202512 · pippib v20200923",
    coverage: { id: "Indonesia", en: "Indonesia" },
    description: {
      id: "688 kawasan lindung WDPA dan 42.027 poligon moratorium hutan KLHK (PIPPIB).",
      en: "688 WDPA protected areas and 42,027 KLHK forest moratorium (PIPPIB) polygons.",
    },
    status: "active",
  },
  {
    layer: "mangrove",
    name: {
      id: "Mangrove (Global Mangrove Watch v3)",
      en: "Mangroves (Global Mangrove Watch v3)",
    },
    org: "Global Mangrove Watch (UNEP-WCMC, JAXA, Aberystwyth University, dsb.)",
    url: "https://www.globalmangrovewatch.org/",
    license: "CC BY 4.0",
    updated: "v3 (ekstent 2020)",
    coverage: {
      id: "Indonesia (~223.900 poligon)",
      en: "Indonesia (~223,900 polygons)",
    },
    description: {
      id: "Sebaran mangrove Indonesia dari citra satelit (ekstent 2020), habitat pesisir kritis bagi bekantan, buaya, burung air, dan area pembibitan ikan.",
      en: "Indonesia's mangrove extent from satellite imagery (2020), a critical coastal habitat for proboscis monkeys, crocodiles, water birds, and fish nurseries.",
    },
    status: "active",
  },
  {
    layer: "peatland",
    name: {
      id: "Gambut (Indonesia peat lands)",
      en: "Peatlands (Indonesia peat lands)",
    },
    org: "Global Forest Watch (sumber: Wetlands International / Wahyunto dkk.)",
    url: "https://data.globalforestwatch.org/datasets/d52e0e67ad21401cbf3a2c002599cf58_10",
    license: "CC BY 4.0",
    updated: "Peta gambut 2003–2006 (1:250.000)",
    coverage: { id: "Indonesia (1.524 poligon)", en: "Indonesia (1,524 polygons)" },
    description: {
      id: "Sebaran lahan gambut Indonesia, ekosistem kaya karbon dan rawan kebakaran, habitat penting yang lenyap saat dikeringkan dan dibakar.",
      en: "Indonesia's peatland extent, a carbon-rich, fire-prone ecosystem and important habitat that vanishes when drained and burned.",
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
    layer: "species-dist",
    name: {
      id: "Sebaran satwa (GBIF + IUCN + habitat ESA WorldCover)",
      en: "Wildlife distribution (GBIF + IUCN + ESA WorldCover habitat)",
    },
    org: "GBIF (perjumpaan) · IUCN Red List (status) · ESA WorldCover (habitat) · Permen LHK P.106/2018, KKP & CITES",
    url: "https://www.gbif.org",
    license: "GBIF per-dataset (CC0 / CC BY / CC BY-NC); status: IUCN Red List; habitat: ESA WorldCover CC BY 4.0",
    updated: "Offline build",
    coverage: {
      id: "Ratusan spesies prioritas konservasi (terancam & endemik), semua kelas, Sumatera–Papua, darat & laut",
      en: "Hundreds of conservation-priority species (threatened & endemic), all classes, Sumatra–Papua, land & sea",
    },
    description: {
      id: "Area kepadatan sebaran spesies prioritas konservasi (terancam IUCN + flagship/endemik) semua kelas, diturunkan dari titik perjumpaan GBIF (1990–kini), BUKAN poligon sebaran resmi. Kepadatan dibobot tutupan habitat alami (ESA WorldCover: hutan, sabana, lahan basah, mangrove) dan titik di perkotaan dibuang, lalu dikontur per pulau sehingga tiap spesies tetap di pulaunya (mis. harimau Sumatera tak bocor ke Jawa). Mewakili tiap wilayah: Sundaland, Wallacea (anoa, maleo, komodo), Papua (kanguru pohon, nokdiak), serta laut & sungai. Untuk spesies kriptik yang koordinatnya disembunyikan demi perlindungan (mis. badak), ditambahkan penanda sebaran terdokumentasi (IUCN/KLHK), ditandai jelas dan bukan catatan lapangan. Poligon sebaran resmi IUCN tidak dipakai karena lisensinya membatasi redistribusi.",
      en: "Density areas of conservation-priority species (IUCN-threatened + flagship/endemic), all classes, derived from GBIF occurrence points (1990–present), NOT official range polygons. Density is weighted by natural-habitat cover (ESA WorldCover: forest, savanna, wetland, mangrove) with city points dropped, then contoured per island so each species stays on its island (a Sumatran tiger never bleeds into Java). Spans every region: Sundaland, Wallacea (anoa, maleo, Komodo), Papua (tree-kangaroo, echidna), and the sea & rivers. For cryptic species whose coordinates are withheld for protection (e.g. rhino), documented-range markers (IUCN/KLHK) are added, clearly flagged and not field records. IUCN's official range polygons are not used because their licence restricts redistribution.",
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
    layer: "karhutla-image",
    name: {
      id: "Citra asli harian (NASA Worldview / GIBS, True Color)",
      en: "Daily true-colour imagery (NASA Worldview / GIBS)",
    },
    org: "NASA EOSDIS GIBS / Worldview (LANCE)",
    url: "https://worldview.earthdata.nasa.gov/",
    license: "Domain publik / Public domain (NASA)",
    updated: "Harian / Daily",
    coverage: {
      id: "Global; MODIS Terra sejak 2000, VIIRS sejak 2015",
      en: "Global; MODIS Terra from 2000, VIIRS from 2015",
    },
    description: {
      id: "Mozaik citra satelit warna asli untuk SATU hari pilihan, disajikan langsung dari ubin NASA GIBS (tanpa kunci, tanpa kami olah). Dipakai untuk memeriksa karhutla: asap dan bekas bakar terlihat mata telanjang, sehingga hotspot bisa dicocokkan dengan apa yang benar-benar direkam sensor. Nama produk pada peta adalah nama lapisan Worldview persis, jadi hari yang sama bisa dibuka dan dibandingkan di Worldview.",
      en: "True-colour satellite mosaic for ONE chosen day, streamed straight from NASA GIBS tiles (keyless, not processed by us). Used to check land & forest fires: smoke and burn scars are visible to the naked eye, so a hotspot can be matched against what the sensor actually recorded. The product name shown on the map is the exact Worldview layer name, so the same day can be opened and compared in Worldview.",
    },
    status: "active",
  },
  {
    layer: "karhutla-hotspot",
    name: {
      id: "Hotspot harian arsip (NASA Worldview / GIBS, FIRMS)",
      en: "Daily archived hotspots (NASA Worldview / GIBS, FIRMS)",
    },
    org: "NASA FIRMS via EOSDIS GIBS / Worldview",
    url: "https://worldview.earthdata.nasa.gov/",
    license: "Domain publik / Public domain (NASA)",
    updated: "Harian / Daily",
    coverage: {
      id: "Global; MODIS sejak 2002, VIIRS 375 m sejak 2012",
      en: "Global; MODIS from 2002, VIIRS 375 m from 2012",
    },
    description: {
      id: "Deteksi anomali panas FIRMS untuk satu hari pilihan, sehingga satu musim karhutla bisa diputar hari demi hari, berbeda dari lapisan Hotspot (48 jam) yang hanya near-real-time. Karena GIBS hanya menerbitkan ubin vektornya dalam EPSG:4326, lapisan ini digambar lewat WMS GIBS sebagai gambar: belum bisa diklik. Hotspot adalah deteksi panas yang belum diverifikasi, bukan bukti kebakaran maupun keterkaitan dengan pihak mana pun.",
      en: "FIRMS thermal-anomaly detections for one chosen day, so a fire season can be replayed day by day — unlike the Hotspots (48h) layer, which is near-real-time only. Because GIBS publishes these vector tiles in EPSG:4326 only, this layer is drawn via the GIBS WMS as an image, and is therefore not clickable. A hotspot is an unverified heat detection, not proof of a fire nor of any party's involvement.",
    },
    status: "active",
  },
  {
    layer: null,
    name: {
      id: "Lapisan referensi (label, batas, jalan, garis pantai)",
      en: "Reference overlays (labels, borders, roads, coastlines)",
    },
    org: "NASA EOSDIS GIBS / Worldview, dari OpenStreetMap",
    url: "https://worldview.earthdata.nasa.gov/",
    license: "OpenStreetMap ODbL",
    updated: "Statis / Static",
    coverage: { id: "Global (z0–8)", en: "Global (z0–8)" },
    description: {
      id: "Nama tempat, batas wilayah, jalan, dan garis pantai turunan OpenStreetMap yang disajikan NASA GIBS. Tampil otomatis bersama citra satelit NASA (bukan lapisan terpisah): citra itu menutupi peta dasar beserta labelnya, jadi overlay ini mengembalikan konteks lokasi. Hanya penanda orientasi, bukan sumber data lingkungan, dan tidak dipakai untuk perhitungan apa pun.",
      en: "OpenStreetMap-derived place names, boundaries, roads, and coastlines served by NASA GIBS. Shown automatically with the NASA satellite imagery (not a separate layer): that imagery covers the basemap and its labels, so this overlay restores locational context. Orientation only — not an environmental data source, and not used in any calculation.",
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
    layer: null,
    name: { id: "Sebaran resmi spesies (poligon IUCN)", en: "Official species range polygons (IUCN)" },
    org: "IUCN Red List spatial data",
    url: "https://www.iucnredlist.org/resources/spatial-data-download",
    license: "Non-commercial, redistribution restricted",
    updated: "-",
    coverage: { id: "Perlu registrasi & perjanjian lisensi", en: "Requires registration & license agreement" },
    description: {
      id: "Poligon sebaran resmi IUCN butuh token + perjanjian dan membatasi redistribusi, sehingga tidak bisa kami sajikan langsung. Sebagai alternatif terbuka, Peta Sebaran Satwa memakai titik keberadaan (GBIF) yang dibobot tutupan habitat alami (ESA WorldCover).",
      en: "IUCN's authoritative range polygons require a token + agreement and restrict redistribution, so we cannot serve them directly. As an open alternative, the Wildlife Distribution layer uses occurrence points (GBIF) weighted by natural-habitat cover (ESA WorldCover).",
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
