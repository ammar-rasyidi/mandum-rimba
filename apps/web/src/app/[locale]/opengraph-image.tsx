import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getTranslations } from "next-intl/server";

// 1200×630 social/SEO card rendered to a real PNG (satori → resvg). The terrain
// render sits behind it, with the brand wordmark and a localized tagline over
// the top, so /id and /en each get their own card. Next wires this into
// og:image AND twitter:image automatically for every page under [locale].
//
// og_background.jpg is the 1200x630 cut of mandum_rimba_full_3d.png. The full
// render is 2926x1530 and several megabytes, far too heavy to inline as a data
// URI on every build.
export const runtime = "nodejs";
export const alt = "Mandum Rimba";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return [{ locale: "id" }, { locale: "en" }];
}

const HERO_W = 760;
const HERO_H = Math.round((HERO_W * 95) / 377); // wordmark is 377×95

// satori needs a real font file (TTF/OTF). Google's css2 endpoint serves
// truetype when no modern UA is sent; we subset to just the glyphs we draw.
async function loadGoogleFont(
  weight: number,
  text: string,
): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(
    text,
  )}`;
  const css = await (await fetch(url)).text();
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  if (!src) throw new Error(`could not resolve Inter ${weight}`);
  const res = await fetch(src[1]);
  if (!res.ok) throw new Error(`could not fetch Inter ${weight}`);
  return res.arrayBuffer();
}

export default async function OpengraphImage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const heroB64 = await readFile(
    join(process.cwd(), "public/images/hero_dark.svg"),
    "base64",
  );
  const hero = `data:image/svg+xml;base64,${heroB64}`;
  const bgB64 = await readFile(
    join(process.cwd(), "public/images/og_background.jpg"),
    "base64",
  );
  const bg = `data:image/jpeg;base64,${bgB64}`;

  // Best effort: the rich, text-bearing card. If the web font can't be fetched
  // at build time, fall back to a clean logo-only card, never fail the build
  // over the share image.
  try {
    const t = await getTranslations({ locale, namespace: "site" });
    const tagline = t("tagline");
    const eyebrow =
      locale === "en" ? "OPEN OBSERVATORY" : "OBSERVATORIUM TERBUKA";
    const domain = "mandumrimba.org";

    const glyphs = eyebrow + tagline + domain;
    const [regular, bold] = await Promise.all([
      loadGoogleFont(400, glyphs),
      loadGoogleFont(700, glyphs),
    ]);

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            position: "relative",
            fontFamily: "Inter",
            backgroundColor: "#0a0f0c",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bg}
            width={1200}
            height={630}
            alt=""
            style={{ position: "absolute", top: 0, left: 0 }}
          />
          {/* scrim, so the wordmark and tagline stay legible over the relief */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 1200,
              height: 630,
              background:
                "linear-gradient(105deg, rgba(6,12,9,0.92) 0%, rgba(6,12,9,0.78) 42%, rgba(6,12,9,0.24) 78%, rgba(6,12,9,0.12) 100%)",
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: 1200,
              height: 630,
              padding: "72px 80px",
            }}
          >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                background: "#8fd8a4",
              }}
            />
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#8fd8a4",
                letterSpacing: 3,
              }}
            >
              {eyebrow}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero} width={HERO_W} height={HERO_H} alt="" />
            <div
              style={{
                marginTop: 36,
                fontSize: 42,
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1.25,
                maxWidth: 900,
              }}
            >
              {tagline}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 700, color: "#8fd8a4" }}>
              {domain}
            </div>
            <div
              style={{
                width: 130,
                height: 6,
                borderRadius: 3,
                background: "#4caf50",
              }}
            />
          </div>
          </div>
        </div>
      ),
      {
        ...size,
        fonts: [
          { name: "Inter", data: regular, weight: 400, style: "normal" },
          { name: "Inter", data: bold, weight: 700, style: "normal" },
        ],
      },
    );
  } catch {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            backgroundColor: "#0a0f0c",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bg}
            width={1200}
            height={630}
            alt=""
            style={{ position: "absolute", top: 0, left: 0 }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 1200,
              height: 630,
              background: "rgba(6,12,9,0.72)",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero} width={HERO_W} height={HERO_H} alt="" style={{ position: "relative" }} />
        </div>
      ),
      size,
    );
  }
}
