import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import ThreadsEmbed from "@/components/ThreadsEmbed";
import HomeHero from "@/components/HomeHero";
import MapShowcase from "@/components/MapShowcase";
import Spotlight from "@/components/Spotlight";

// Curated Threads posts on how Mandum Rimba began (order matters; share tokens
// stripped). Update these to feature different posts.
const THREADS_POSTS = [
  "https://www.threads.com/@r.rasyidi/post/DZcrtJYm5Z5",
  "https://www.threads.com/@r.rasyidi/post/DZexry8EgGa",
  "https://www.threads.com/@r.rasyidi/post/DZpvpajkvNt",
  "https://www.threads.com/@r.rasyidi/post/DaFwup2EqiX",
];

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.95rem] font-medium transition-[transform,filter,background-color] hover:-translate-y-px hover:no-underline";
const btnPrimary = `${btnBase} bg-accent text-background hover:brightness-110`;
const btnGhost = `${btnBase} glass text-foreground hover:brightness-[1.04]`;

/** Small green-dot kicker used to open every section. */
function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.2em] ${
        light ? "text-white/85" : "text-accent"
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          light ? "bg-[var(--accent)]" : "bg-accent"
        }`}
      />
      {children}
    </span>
  );
}

export default function HomePage() {
  const t = useTranslations("home");
  const tSite = useTranslations("site");

  const giants = [
    { img: "orangutan-leuser.jpg", name: t("giantOrangutan"), sci: "Pongo abelii", pos: "50% 35%" },
    { img: "tiger-wild.jpg", name: t("giantTiger"), sci: "Panthera tigris sumatrae", pos: "50% 42%" },
    { img: "elephant.jpg", name: t("giantElephant"), sci: "Elephas maximus sumatranus", pos: "50% 45%" },
    { img: "rhino.jpg", name: t("giantRhino"), sci: "Dicerorhinus sumatrensis", pos: "50% 40%" },
  ];

  const stories = [
    { id: "gunung-leuser", title: t("storyLeuserTitle"), body: t("storyLeuserBody"), img: "/images/story/leuser-landscape.jpg" },
    { id: "tesso-nilo", title: t("storyTitle"), body: t("storyBody"), img: "/images/story/forest.jpg" },
  ];

  const badges = [
    t("badgeIndependent"),
    t("badgeNonprofit"),
    t("badgeOpenSource"),
    t("badgeEvidence"),
  ];

  const actions = [
    {
      href: "/kampanye" as const,
      title: t("campaignCta"),
      sub: t("campaignCtaSub"),
      emphasis: false,
      icon: (
        <>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0Z" />
          <circle cx="12" cy="10" r="3" />
        </>
      ),
    },
    {
      href: "/kartu" as const,
      title: t("ktpCta"),
      sub: t("ktpCtaSub"),
      emphasis: false,
      icon: (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="11" r="2" />
          <path d="M13 9.5h5M13 13h5M6 15.5h7" />
        </>
      ),
    },
    {
      href: "/dukung" as const,
      title: t("supportCta"),
      sub: t("supportCtaSub"),
      emphasis: true,
      icon: (
        <>
          <path d="M12 22V11" />
          <path d="M12 12C12 8 9 4 4 4c0 5 3 8 8 8Z" />
          <path d="M12 14c0-3 3-6 8-6 0 4-3 6-8 6Z" />
        </>
      ),
    },
  ];

  // "Why this matters" as cinematic photo-backed cards (matching giants/stories)
  const missions = [
    { title: t("mission1Title"), body: t("mission1Body"), img: "/images/story/sunbear.jpg", pos: "50% 40%" },
    { title: t("mission2Title"), body: t("mission2Body"), img: "/images/story/forest.jpg", pos: "50% 55%" },
    { title: t("mission3Title"), body: t("mission3Body"), img: "/images/story/leuser-landscape.jpg", pos: "50% 55%" },
  ];

  const principles = [
    { title: t("principle1Title"), body: t("principle1Body") },
    { title: t("principle2Title"), body: t("principle2Body") },
    { title: t("principle3Title"), body: t("principle3Body") },
  ];

  return (
    <>
      {/* ============================ HERO ============================ */}
      <HomeHero />

      <main className="relative z-10 mx-auto max-w-[1080px] px-5">
        {/* ==================== Quick actions ==================== */}
        <section className="reveal -mt-2 flex flex-col items-center pt-12 text-center">
          {/* hand-drawn wordmark, theme-aware (dark art on dark, light on light) */}
          <img
            src="/images/hero_url_dark.svg"
            alt={tSite("name")}
            className="mx-auto hidden h-auto w-full max-w-[380px] dark:block"
          />
          <img
            src="/images/hero_url_light.svg"
            alt={tSite("name")}
            className="mx-auto block h-auto w-full max-w-[380px] dark:hidden"
          />
          <p className="mx-auto mt-5 max-w-[36rem] text-[1.02rem] leading-relaxed text-muted">
            {t("campaignCaption")}
          </p>
          <div className="mx-auto mt-7 grid w-full max-w-[720px] gap-3 sm:grid-cols-3">
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={`group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center shadow-[0_10px_30px_-16px_rgba(0,0,0,0.55)] transition-[transform,border-color,filter] hover:-translate-y-0.5 hover:no-underline ${
                  a.emphasis
                    ? "border-accent bg-[var(--accent-dim)] hover:brightness-[1.05]"
                    : "glass border-[var(--glass-border)] hover:border-accent"
                }`}
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full transition-transform group-hover:scale-105 ${
                    a.emphasis ? "bg-accent text-background" : "bg-[var(--accent-dim)] text-accent"
                  }`}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {a.icon}
                  </svg>
                </span>
                <span className="text-[0.95rem] font-semibold leading-tight text-foreground">
                  {a.title}
                </span>
                <span className="text-[0.76rem] leading-snug text-muted">{a.sub}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ==================== Four giants ==================== */}
        <section className="reveal mt-24">
          <Eyebrow>{t("giantsKicker")}</Eyebrow>
          <h2 className="sweep mb-0 mt-3 text-[2.1rem] font-bold leading-[1.05] tracking-[-0.02em] [text-wrap:balance] md:text-[2.5rem]">
            {t("giantsTitle")}
          </h2>
          <p className="mt-4 max-w-[46rem] text-[1.05rem] leading-relaxed text-muted">
            {t("giantsBody")}
          </p>
          {/* breaks the 1080px column on wide screens so the four of them run
              the full width of the display, which is the point of them */}
          <Spotlight className="mt-9 grid grid-cols-2 gap-3.5 md:grid-cols-4 md:gap-5 xl:mx-[calc(50%-49vw)] xl:max-w-[98vw]">
            {giants.map((g) => (
              <figure
                key={g.img}
                className="spotlight group relative m-0 aspect-[3/4] overflow-hidden rounded-2xl shadow-[0_18px_44px_-26px_rgba(0,0,0,0.75)] md:aspect-[4/5]"
              >
                <img
                  src={`/images/story/${g.img}`}
                  alt={g.name}
                  loading="lazy"
                  style={{ objectPosition: g.pos }}
                  className="absolute inset-0 h-full w-full object-cover brightness-[0.9] saturate-[1.05] transition-[transform,filter] duration-[1100ms] ease-out group-hover:scale-[1.11] group-hover:brightness-110"
                />
                <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(4,10,8,0.92)_0%,rgba(4,10,8,0.32)_46%,rgba(4,10,8,0.04)_100%)]" />
                {/* accent ring lifts on hover */}
                <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10 transition duration-300 group-hover:ring-2 group-hover:ring-[color:var(--accent)]" />
                <span className="absolute left-3 top-3 inline-flex rounded-full bg-[color:var(--danger)] px-2 py-0.5 text-[0.56rem] font-bold uppercase tracking-wider text-white shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
                  {t("statusCR")}
                </span>
                <figcaption className="absolute inset-x-0 bottom-0 p-4 [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">
                  <div className="text-[1.05rem] font-semibold leading-tight text-white md:text-[1.25rem]">
                    {g.name}
                  </div>
                  <div className="mt-0.5 text-[0.72rem] italic leading-tight text-white/65">
                    {g.sci}
                  </div>
                  {/* a hairline that draws itself in as you hover the card */}
                  <div className="mt-3 h-px w-0 bg-[color:var(--accent)] transition-[width] duration-500 ease-out group-hover:w-14" />
                </figcaption>
              </figure>
            ))}
          </Spotlight>
        </section>

        {/* ==================== Place stories ==================== */}
        <section className="reveal mt-20 flex flex-col gap-5">
          {stories.map((s) => (
            <Link
              key={s.id}
              href={{ pathname: "/peta", query: { story: s.id } }}
              className="group relative flex min-h-[300px] items-end overflow-hidden rounded-3xl border border-[var(--glass-border)] shadow-[var(--shadow)] transition-transform hover:-translate-y-0.5 hover:no-underline md:min-h-[340px]"
            >
              <img
                src={s.img}
                alt=""
                aria-hidden
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-transparent" />
              <div className="relative z-10 max-w-[40rem] p-8 md:p-11">
                <Eyebrow light>{t("storyKicker")}</Eyebrow>
                <h3 className="mb-0 mt-2.5 text-[1.8rem] font-bold leading-[1.08] tracking-tight text-white [text-wrap:balance] md:text-[2.1rem]">
                  {s.title}
                </h3>
                <p className="mt-3 max-w-[34rem] text-[1rem] leading-relaxed text-white/80">
                  {s.body}
                </p>
                <span className="mt-5 inline-flex items-center gap-2.5 rounded-full bg-accent px-5 py-2.5 text-[0.95rem] font-semibold text-background transition-[filter] group-hover:brightness-110">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background/25">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                      <path d="M2 1.5 10 6l-8 4.5z" />
                    </svg>
                  </span>
                  {t("storyCta")}
                </span>
              </div>
            </Link>
          ))}
        </section>

        {/* ==================== Map showcase (carousel) ==================== */}
        <MapShowcase />

        {/* ==================== Manifesto ==================== */}
        <section className="reveal my-20 max-w-[52rem]">
          <Eyebrow>{tSite("name")}</Eyebrow>
          <h2 className="mt-4 text-[1.7rem] font-bold leading-[1.15] tracking-tight [text-wrap:balance] md:text-[2.05rem]">
            {tSite("tagline")}
          </h2>
          <p className="mt-5 text-[1.08rem] leading-relaxed text-muted">{t("heroBody")}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className={btnPrimary} href="/peta">
              {t("openMap")}
            </Link>
            <Link className={btnGhost} href="/metodologi">
              {t("readMethodology")}
            </Link>
          </div>
        </section>

        {/* ==================== About Mandum Rimba ==================== */}
        <section className="reveal relative my-16 overflow-hidden rounded-3xl border border-[var(--glass-border)] shadow-[var(--shadow)]">
          <img
            src="/images/story/tualang.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover object-[50%_35%]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,10,8,0.82),rgba(6,10,8,0.93))]" />
          <div className="relative z-10 px-8 py-10 md:px-12 md:py-14">
            <Eyebrow light>{tSite("name")}</Eyebrow>
            <h2 className="mb-0 mt-3 text-[1.7rem] font-bold tracking-tight text-white [text-wrap:balance] md:text-[2.05rem]">
              {t("aboutTitle")}
            </h2>
            <div className="mb-7 mt-6 flex flex-wrap items-stretch gap-3">
              <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 backdrop-blur-sm">
                <span className="text-[1.2rem] font-bold text-[#81c784]">Mandum</span>
                <span className="text-[0.88rem] leading-snug text-white/70">{t("nameMandum")}</span>
              </div>
              <span className="select-none self-center text-[1.4rem] font-light text-white/50">+</span>
              <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 backdrop-blur-sm">
                <span className="text-[1.2rem] font-bold text-[#81c784]">Rimba</span>
                <span className="text-[0.88rem] leading-snug text-white/70">{t("nameRimba")}</span>
              </div>
            </div>
            <p className="max-w-[46rem] leading-relaxed text-white/85">{t("nameMeaning")}</p>
            <p className="mt-3 max-w-[46rem] leading-relaxed text-white/70">{t("publicInterest")}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {badges.map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-white/25 px-3 py-1 text-[0.78rem] text-white/80"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== Why this matters ==================== */}
        <section className="reveal mt-20">
          <Eyebrow>{t("missionTitle")}</Eyebrow>
          <div className="mt-6 grid gap-x-6 gap-y-9 md:grid-cols-3">
            {missions.map((m) => (
              <div key={m.title} className="group flex flex-col">
                {/* image only, no card, no background */}
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl">
                  <img
                    src={m.img}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    style={{ objectPosition: m.pos }}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                {/* caption sits on the page itself, outside the image */}
                <h3 className="mb-0 mt-4 text-[1.15rem] font-semibold leading-tight text-foreground">
                  {m.title}
                </h3>
                <p className="mb-0 mt-2 text-[0.93rem] leading-relaxed text-muted">
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ==================== Principles ==================== */}
        <section className="reveal mt-16">
          <div className="grid gap-4 md:grid-cols-3">
            {principles.map((p) => (
              <div
                key={p.title}
                className="glass group relative overflow-hidden rounded-2xl p-6 transition-transform hover:-translate-y-0.5"
              >
                <span className="block h-1 w-9 rounded-full bg-accent" />
                <h3 className="mb-0 mt-4 text-[1.05rem] font-semibold">{p.title}</h3>
                <p className="mb-0 mt-2 text-[0.95rem] leading-relaxed text-muted">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ==================== CTA (epic globe band) ==================== */}
        <section className="reveal relative my-16 overflow-hidden rounded-3xl border border-[var(--glass-border)] shadow-[var(--shadow)]">
          <img
            src="/images/mandum_rimba_full_3d.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover object-[center_30%]"
          />
          <div className="absolute inset-0 bg-[radial-gradient(80%_120%_at_50%_-20%,rgba(129,199,132,0.2),transparent_55%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,8,12,0.8),rgba(3,8,12,0.92))]" />
          <div className="relative z-10 px-8 py-16 text-center">
            <h2 className="mx-auto max-w-[22ch] text-[1.8rem] font-bold tracking-tight text-white [text-wrap:balance] md:text-[2.3rem]">
              {t("ctaTitle")}
            </h2>
            <p className="mx-auto mb-8 mt-4 max-w-[36rem] leading-relaxed text-white/80">
              {t("ctaBody")}
            </p>
            <Link
              className="inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-[1rem] font-semibold text-background shadow-[0_14px_38px_-14px_rgba(0,0,0,0.65)] transition hover:brightness-110 hover:-translate-y-px hover:no-underline"
              href="/peta"
            >
              {t("openMap")}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
          </div>
        </section>

        {/* ==================== How it began ==================== */}
        <section className="reveal mb-20 mt-10 border-t border-[var(--glass-border)] pt-16">
          <div className="mx-auto max-w-[620px] text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--bg-raised)] px-3.5 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted">
              <img
                src="/images/Threads_logo.svg"
                alt="Threads"
                className="h-3.5 w-3.5 dark:invert"
              />
              Threads
            </span>
            <h2 className="mb-0 mt-4 text-[1.65rem] font-bold tracking-tight [text-wrap:balance] md:text-[1.95rem]">
              {t("threadsTitle")}
            </h2>
            <p className="mx-auto mt-3 leading-relaxed text-muted">{t("threadsBody")}</p>
          </div>
          <ThreadsEmbed urls={THREADS_POSTS} />
        </section>
      </main>
    </>
  );
}
