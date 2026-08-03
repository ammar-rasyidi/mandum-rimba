/**
 * "Kisah Kawasan" — cinematic, factual place stories told on the 3D terrain.
 * Config-driven so new places drop in easily. Every figure is observational and
 * sourced (Mandum Rimba stays neutral — we present data, not verdicts).
 *
 * First place: Taman Nasional Tesso Nilo (Riau). Figures verified against:
 *  - Nusantara Atlas / TheTreeMap (natural forest remaining, oil-palm cover, 2021)
 *  - Mongabay (old-growth / primary-forest loss, 2022–2024 reporting)
 *  - Global Forest Watch (tree-cover loss + fires)
 *  - IUCN Red List (Sumatran elephant status)
 */

export interface Bi {
  id: string;
  en: string;
}
export interface StorySource {
  name: string;
  url: string;
}
/** a floating, terrain-anchored callout: a glowing dot on the map + a leader
 *  line up to a mini info card */
export interface Annotation {
  lngLat: [number, number];
  value?: string;
  title: Bi;
  note?: Bi;
  /** an extra informative line */
  sub?: Bi;
  source?: StorySource;
  /** a floating photo (free-licensed) shown on top of the callout card */
  photo?: {
    /** same-origin path under /public */
    src: string;
    /** photographer / author, for attribution */
    credit: string;
    /** license short name, e.g. "CC BY-SA 4.0" */
    license: string;
    /** link to the source/description page */
    url: string;
  };
}
export interface Chapter {
  id: string;
  /** camera vantage for this beat */
  cam: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    /** ms for the move INTO this chapter (default 5000) */
    duration?: number;
  };
  title: Bi;
  body: Bi;
  /** a big headline number, optional */
  stat?: { value: string; label: Bi };
  source?: StorySource;
  /** a bulleted list of sourced points — used for the "issues summary" beat */
  points?: { text: Bi; source?: StorySource }[];
  /** map layer ids to switch on while this chapter is showing */
  layers?: string[];
  /** floating 3D markers pinned to points on the terrain */
  annotations?: Annotation[];
  /** play the tree-cover-loss year animation (2001→now) during this beat */
  animateLoss?: boolean;
}
export interface PlaceStory {
  id: string;
  name: string;
  region: Bi;
  /** geofence [w,s,e,n] — entering this at/above `minZoom` offers the story */
  bounds: [number, number, number, number];
  minZoom: number;
  /** the dramatic opening vantage the intro flies TO */
  chapters: Chapter[];
  /** de-duped citation list shown at the end */
  sources: StorySource[];
  /** park outline — raised as a glowing 3D prism during the story. When
   *  `boundaryQuery` is set, the real WDPA polygon is fetched from the backend
   *  (/v1/protected/geometry); `boundary` is the offline fallback. */
  boundary?: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  boundaryQuery?: string;
  /** official account to follow, shown as a card on the closing beat */
  instagram?: { handle: string; url: string; name: Bi };
  /** ambient bed that loops during the story (muteable via the top bar) */
  sound?: { src: string; credit?: string; license?: string; url?: string };
  /** cinematic music layered under the ambient bed (shares the mute toggle) */
  music?: { src: string; credit?: string; license?: string; url?: string };
}

const SRC = {
  atlas: {
    name: "Nusantara Atlas (TheTreeMap)",
    url: "https://nusantara-atlas.org/the-vanishing-forests-of-tesso-nilo-national-park/",
  },
  mongabay: {
    name: "Mongabay",
    url: "https://news.mongabay.com/2023/10/indonesias-besieged-tesso-nilo-national-park-faces-another-year-of-heavy-deforestation/",
  },
  gfw: {
    name: "Global Forest Watch",
    url: "https://www.globalforestwatch.org/",
  },
  iucn: {
    name: "IUCN Red List",
    url: "https://www.iucnredlist.org/species/7140/45818198",
  },
  // accessible aggregator that carries the primary citations (CBM 2001 plant
  // survey, 2012 fecal-DNA elephant estimate, WWF deforestation/oil-palm figures)
  wiki: {
    name: "Wikipedia · Tesso Nilo NP",
    url: "https://en.wikipedia.org/wiki/Tesso_Nilo_National_Park",
  },
} satisfies Record<string, StorySource>;

export const PLACE_STORIES: PlaceStory[] = [
  {
    id: "tesso-nilo",
    name: "Taman Nasional Tesso Nilo",
    region: { id: "Riau · Sumatra", en: "Riau · Sumatra" },
    bounds: [101.5, -0.5, 102.3, 0.05],
    minZoom: 8,
    chapters: [
      {
        id: "arrival",
        cam: { center: [101.9, -0.18], zoom: 9, pitch: 62, bearing: 24, duration: 7000 },
        title: { id: "Taman Nasional Tesso Nilo", en: "Tesso Nilo National Park" },
        body: { id: "Riau · Sumatra", en: "Riau · Sumatra" },
        // open on the pressures around the park: concessions + protected areas
        layers: ["concessions", "protected"],
      },
      {
        id: "place",
        cam: { center: [101.9, -0.18], zoom: 9.3, pitch: 60, bearing: 42, duration: 5500 },
        title: { id: "Bentang Hutan Dataran Rendah", en: "A Lowland Forest, Still Standing" },
        body: {
          id: "Di jantung Riau, masih ada bentang hutan dataran rendah yang bertahan. Tesso Nilo melindungi sekitar 81.000 hektare, menjadi salah satu sisa hutan dataran rendah terpenting di Sumatra.",
          en: "In the heart of Riau, a stretch of lowland forest still holds on. Tesso Nilo shelters around 81,000 hectares, one of the last great lowland forests left in Sumatra.",
        },
        stat: { value: "±81.000 ha", label: { id: "Luas taman", en: "Park area" } },
        source: SRC.atlas,
        annotations: [
          {
            lngLat: [101.9, -0.18],
            value: "±81.000 ha",
            title: { id: "Batas taman", en: "Park boundary" },
            note: { id: "ditetapkan 2004, diperluas 2009", en: "gazetted 2004, expanded 2009" },
            source: SRC.atlas,
          },
          {
            lngLat: [101.86, -0.16],
            title: { id: "Pohon tualang", en: "Tualang tree" },
            note: { id: "Koompassia excelsa", en: "Koompassia excelsa" },
            sub: {
              id: "salah satu pohon tertinggi hutan dataran rendah",
              en: "one of the tallest lowland-forest trees",
            },
            photo: {
              src: "/images/story/tualang.jpg",
              credit: "Dick Culbert",
              license: "CC BY 2.0",
              url: "https://commons.wikimedia.org/wiki/File:Koompassia_excelsa,_the_Mengaris_Tree_(14312506649).jpg",
            },
          },
        ],
      },
      {
        id: "biodiversity",
        cam: { center: [101.85, -0.2], zoom: 10.6, pitch: 60, bearing: 32, duration: 5500 },
        title: { id: "Salah Satu Hutan Terkaya di Dunia", en: "One of the Richest Forests on Earth" },
        body: {
          id: "Dalam sepetak tanah seluas ruang tamu kecil, hanya 200 meter persegi, ilmuwan menemukan 218 jenis tumbuhan berpembuluh. Salah satu kepadatan tumbuhan tertinggi yang pernah dicatat di hutan tropis mana pun.",
          en: "In a patch of ground no bigger than a small living room, just 200 square metres, scientists found 218 species of vascular plants. One of the highest plant densities ever recorded in any tropical forest.",
        },
        stat: {
          value: "218 jenis",
          label: { id: "tumbuhan / 200 m²", en: "plants / 200 m²" },
        },
        source: SRC.wiki,
        annotations: [
          {
            lngLat: [101.85, -0.2],
            value: "218 jenis",
            title: { id: "Dalam petak 200 m²", en: "In one 200 m² plot" },
            note: {
              id: "survei Center for Biodiversity Management, 2001",
              en: "Center for Biodiversity Management survey, 2001",
            },
            sub: {
              id: "≈360 jenis per hektar (LIPI & WWF, 2003)",
              en: "≈360 species per hectare (LIPI & WWF, 2003)",
            },
            source: SRC.wiki,
            photo: {
              src: "/images/story/forest.jpg",
              credit: "Johannnindito Adisuryo",
              license: "CC BY-SA 4.0",
              url: "https://commons.wikimedia.org/wiki/File:Pristine_and_Glazing_Water_of_Santi_River,_Riau,_Indonesia.jpg",
            },
          },
          {
            lngLat: [101.88, -0.22],
            title: { id: "Kantong semar", en: "Pitcher plant" },
            note: { id: "Nepenthes ampullaria", en: "Nepenthes ampullaria" },
            sub: {
              id: "tumbuhan karnivora hutan dataran rendah",
              en: "a carnivorous plant of the lowland forest",
            },
            photo: {
              src: "/images/story/nepenthes.jpg",
              credit: "Bernard DUPONT",
              license: "CC BY-SA 2.0",
              url: "https://commons.wikimedia.org/wiki/File:Pitcher_Plant_(Nepenthes_ampullaria)_(8411421382).jpg",
            },
          },
        ],
      },
      {
        id: "elephants",
        cam: { center: [101.98, -0.23], zoom: 9.9, pitch: 64, bearing: 74, duration: 5500 },
        title: { id: "Rumah Gajah Sumatra", en: "Home of the Sumatran Elephant" },
        body: {
          id: "Bagi Gajah Sumatra, Tesso Nilo bukan sekadar hutan. Ini adalah rumah. Di Daftar Merah IUCN, statusnya Kritis, hanya selangkah dari hilang dari alam liar.",
          en: "For the Sumatran elephant, Tesso Nilo is not just forest. It is home. On the IUCN Red List it is Critically Endangered, a single step from vanishing in the wild.",
        },
        stat: { value: "Kritis (CR)", label: { id: "Status IUCN", en: "IUCN status" } },
        source: SRC.iucn,
        layers: ["species-dist"],
        annotations: [
          {
            lngLat: [101.99, -0.24],
            value: "±120-150",
            title: { id: "Perkiraan jumlah gajah", en: "Estimated elephants" },
            note: {
              id: "lanskap Tesso Nilo · perkiraan DNA feses, 2012",
              en: "Tesso Nilo landscape · 2012 fecal-DNA estimate",
            },
            sub: {
              id: "Elephas maximus sumatranus, Kritis (CR)",
              en: "Elephas maximus sumatranus, Critically Endangered",
            },
            source: SRC.wiki,
            photo: {
              src: "/images/story/elephant.jpg",
              credit: "kusuma wijaya",
              license: "CC BY-SA 4.0",
              url: "https://commons.wikimedia.org/wiki/File:Elephas_Maximus_sumatranus.jpg",
            },
          },
        ],
      },
      {
        id: "wildlife",
        // pulled back + gentler tilt so the three floating photos have room
        cam: { center: [101.95, -0.29], zoom: 9.7, pitch: 50, bearing: 20, duration: 5500 },
        title: { id: "Lebih dari Sekadar Gajah", en: "More Than Elephants" },
        body: {
          id: "Di bawah tajuk yang sama, Harimau Sumatra masih berjalan, subspesies harimau terakhir di Indonesia. Ia berbagi hutan ini dengan tapir, beruang madu, dan rangkong yang suaranya menggema jauh di antara pepohonan.",
          en: "Beneath the same canopy, the Sumatran tiger still moves, the last of Indonesia's tigers. It shares this forest with tapir, sun bears, and hornbills whose calls carry far between the trees.",
        },
        stat: { value: "Kritis (CR)", label: { id: "Harimau Sumatra", en: "Sumatran tiger" } },
        source: SRC.wiki,
        annotations: [
          {
            lngLat: [101.83, -0.32],
            title: { id: "Harimau Sumatra", en: "Sumatran tiger" },
            note: { id: "Panthera tigris sumatrae", en: "Panthera tigris sumatrae" },
            sub: {
              id: "subspesies harimau terakhir di Indonesia",
              en: "Indonesia's last tiger subspecies",
            },
            source: SRC.wiki,
            photo: {
              src: "/images/story/tiger.jpg",
              credit: "Greverod",
              license: "CC BY-SA 3.0",
              url: "https://commons.wikimedia.org/wiki/File:Panthera_tigris_sumatrae_(Sumatran_Tiger)_close-up.jpg",
            },
          },
          {
            lngLat: [101.97, -0.35],
            title: { id: "Rangkong badak", en: "Rhinoceros hornbill" },
            note: { id: "Buceros rhinoceros", en: "Buceros rhinoceros" },
            photo: {
              src: "/images/story/hornbill.jpg",
              credit: "Derek Ramsey",
              license: "CC BY-SA 2.5",
              url: "https://commons.wikimedia.org/wiki/File:Rhinoceros_Hornbill_Buceros_rhinoceros_Head_2200px.jpg",
            },
          },
          {
            lngLat: [102.05, -0.25],
            title: { id: "Tapir Asia", en: "Malayan tapir" },
            note: { id: "Tapirus indicus", en: "Tapirus indicus" },
            photo: {
              src: "/images/story/tapir.jpg",
              credit: "Bernard DUPONT",
              license: "CC BY-SA 2.0",
              url: "https://commons.wikimedia.org/wiki/File:Malayan_Tapir_(Tapirus_indicus)_(8729166864).jpg",
            },
          },
          {
            lngLat: [101.92, -0.3],
            title: { id: "Beruang madu", en: "Sun bear" },
            note: { id: "Helarctos malayanus", en: "Helarctos malayanus" },
            sub: {
              id: "beruang terkecil di dunia",
              en: "the world's smallest bear",
            },
            photo: {
              src: "/images/story/sunbear.jpg",
              credit: "Theo Kruse / Burgers' Zoo",
              license: "CC BY-SA 4.0",
              url: "https://commons.wikimedia.org/wiki/File:Sun_bear_(Helarctos_malayanus).jpg",
            },
          },
        ],
      },
      {
        id: "remaining",
        cam: { center: [101.84, -0.14], zoom: 9.7, pitch: 58, bearing: 18, duration: 5500 },
        title: { id: "Yang Masih Bertahan", en: "What Still Holds On" },
        body: {
          id: "Pada akhir 2021, hutan yang benar-benar utuh tinggal sekitar 13.000 hektare. Hanya sekitar seperenam dari kawasan, tetapi di situlah denyut kehidupan liar Tesso Nilo masih terasa.",
          en: "By the end of 2021, barely 13,000 hectares of forest remained truly intact. Only about a sixth of the park, yet this is where the wild heart of Tesso Nilo still beats.",
        },
        stat: {
          value: "±13.000 ha",
          label: { id: "Hutan alami tersisa (2021)", en: "Natural forest left (2021)" },
        },
        source: SRC.atlas,
        annotations: [
          {
            lngLat: [101.8, -0.1],
            value: "±13.000 ha",
            title: { id: "Hutan alami tersisa", en: "Natural forest left" },
            note: { id: "akhir 2021 · ~16% dari taman", en: "end-2021 · ~16% of the park" },
            source: SRC.atlas,
          },
          {
            lngLat: [101.82, -0.12],
            title: { id: "Owa ungko", en: "Agile gibbon" },
            note: { id: "Hylobates agilis", en: "Hylobates agilis" },
            sub: {
              id: "butuh tajuk hutan yang menyambung",
              en: "needs an unbroken forest canopy",
            },
            photo: {
              src: "/images/story/gibbon.jpg",
              credit: "Klaus Rudloff",
              license: "CC BY-SA 4.0",
              url: "https://commons.wikimedia.org/wiki/File:Hylobates_agilis_2.jpg",
            },
          },
          {
            lngLat: [101.9, -0.17],
            title: { id: "Kuau raja", en: "Great argus" },
            note: { id: "Argusianus argus", en: "Argusianus argus" },
            sub: {
              id: "burung pemalu penghuni lantai hutan",
              en: "a shy pheasant of the forest floor",
            },
            photo: {
              src: "/images/story/argus.jpg",
              credit: "David J. Stang",
              license: "CC BY-SA 4.0",
              url: "https://commons.wikimedia.org/wiki/File:Argusianus_argus_argus_1zz.jpg",
            },
          },
        ],
      },
      {
        id: "changed",
        // near top-down over Tesso Nilo so the tree-cover-loss pattern is
        // clearly readable across the park as the timeline plays
        cam: { center: [101.9, -0.235], zoom: 10.5, pitch: 16, bearing: 0, duration: 6500 },
        title: { id: "Ketika Hutan Mulai Menghilang", en: "As the Forest Began to Vanish" },
        body: {
          id: "Sejak 2004, tutupan hutan menyusut hampir 80 persen. Petak demi petak berubah menjadi kebun sawit, hingga sekitar 41.000 hektare di dalam batas taman ikut hilang. Tekan putar, dan saksikan sendiri perubahannya, tahun demi tahun.",
          en: "Since 2004, forest cover has fallen by nearly 80 percent. Patch by patch, forest gave way to oil palm, until some 41,000 hectares inside the park were gone. Press play, and watch it change, year by year.",
        },
        stat: {
          value: "−80%",
          label: { id: "Tutupan hutan sejak 2004", en: "Forest cover since 2004" },
        },
        source: SRC.atlas,
        // Kawasan lindung & moratorium + Tutupan pohon hilang (2001–2025)
        layers: ["protected", "forestloss"],
        animateLoss: true,
        annotations: [
          {
            lngLat: [101.97, -0.26],
            value: "±41.000 ha",
            title: { id: "Kebun sawit di dalam taman", en: "Oil palm inside the park" },
            note: { id: "2021", en: "2021" },
            sub: { id: "+ ±28.000 ha lahan terbuka/semak", en: "+ ±28,000 ha cleared / shrub" },
            source: SRC.atlas,
          },
        ],
      },
      {
        id: "issues",
        // pull back to the whole park with boundary + loss on, so the summary of
        // pressures is read against the full picture
        cam: { center: [101.85, -0.23], zoom: 9.3, pitch: 50, bearing: 0, duration: 6000 },
        title: { id: "Mengapa Tesso Nilo Penting", en: "Why Tesso Nilo Matters" },
        body: {
          id: "Tesso Nilo tidak menyusut karena satu sebab. Beberapa tekanan bekerja pada waktu yang bersamaan:",
          en: "Tesso Nilo isn't fading for a single reason. Several pressures work on it at the same time:",
        },
        layers: ["protected", "forestloss"],
        source: SRC.gfw,
        points: [
          {
            text: {
              id: "Sekitar sepertiga kawasan kini terbuka dari hutan, sebagian besar berubah menjadi kebun sawit.",
              en: "About a third of the park is now cleared of forest, most of it turned to oil palm.",
            },
            source: SRC.wiki,
          },
          {
            text: {
              id: "Hutan yang tersisa terpecah menjadi petak-petak, mempersempit ruang gerak gajah dan harimau.",
              en: "What forest remains is broken into fragments, narrowing the space elephants and tigers have to roam.",
            },
            source: SRC.mongabay,
          },
          {
            text: {
              id: "Di musim kering, titik panas rutin muncul di dalam dan sekitar kawasan.",
              en: "In the dry season, hotspots appear again and again, inside the park and around it.",
            },
            source: SRC.gfw,
          },
          {
            text: {
              id: "Saat habitat menyempit, perjumpaan antara manusia dan gajah menjadi makin sering.",
              en: "As habitat shrinks, encounters between people and elephants grow more frequent.",
            },
            source: SRC.iucn,
          },
          {
            text: {
              id: "Gajah dan Harimau Sumatra sama-sama Kritis. Kehilangan Tesso Nilo berarti menekan populasi yang sudah sangat sedikit.",
              en: "The Sumatran elephant and tiger are both Critically Endangered. Losing Tesso Nilo would press down on populations that are already very few.",
            },
            source: SRC.iucn,
          },
        ],
      },
      {
        id: "explore",
        cam: { center: [101.9, -0.18], zoom: 9.2, pitch: 52, bearing: 0, duration: 4500 },
        title: { id: "Lanjutkan Penjelajahan", en: "Keep Exploring" },
        body: {
          id: "Setiap angka yang baru saja kamu lihat mewakili sesuatu yang nyata: hutan yang masih berdiri, satwa yang masih bertahan, dan bentang alam yang terus berubah. Sekarang, lanjutkan penjelajahanmu. Geser, putar, dan lihat Tesso Nilo dari dekat. Karena tempat yang benar-benar kita kenal, lebih mudah untuk kita pedulikan.",
          en: "Every number you just saw stands for something real: forest still standing, wildlife still holding on, and a landscape that keeps changing. Now, keep exploring. Pan, rotate, and see Tesso Nilo up close. Because the places we truly come to know are the ones we find easiest to care for.",
        },
      },
    ],
    sources: [SRC.atlas, SRC.mongabay, SRC.gfw, SRC.iucn, SRC.wiki],
    instagram: {
      handle: "btn_tessonilo",
      url: "https://www.instagram.com/btn_tessonilo",
      name: {
        id: "Balai Taman Nasional Tesso Nilo",
        en: "Tesso Nilo National Park Authority",
      },
    },
    sound: {
      src: "/audio/tesso-nilo-ambience.mp3",
      credit: "Red Library",
      license: "CC0",
      url: "https://archive.org/details/Red_Library_Ambience_3",
    },
    music: {
      src: "/audio/tesso-nilo-music.mp3",
      credit: "Kevin MacLeod, incompetech.com",
      license: "CC BY 4.0",
      url: "https://incompetech.com/",
    },
    boundaryQuery: "Tesso Nilo",
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [101.58, -0.03],
          [101.78, -0.01],
          [101.98, -0.05],
          [102.12, -0.14],
          [102.2, -0.27],
          [102.08, -0.39],
          [101.88, -0.45],
          [101.68, -0.43],
          [101.55, -0.3],
          [101.52, -0.15],
          [101.58, -0.03],
        ],
      ],
    },
  },
];
