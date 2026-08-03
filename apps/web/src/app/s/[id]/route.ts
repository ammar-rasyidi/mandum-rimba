import { NextResponse } from "next/server";

/**
 * Share page for a captured map view. Social crawlers read the OG/Twitter tags
 * and unfurl the stored image (so the picture shows in the post); humans are
 * redirected straight to the live map. `id` maps to `/share/<id>.png` on R2.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://mandumrimba.org";

export function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const id = (params.id || "").replace(/[^a-f0-9]/gi, "").slice(0, 32);
  const img = `${SITE}/share/${id}.png`;
  // a story link carries ?story=<slug>: humans land straight in that story
  const story = (new URL(req.url).searchParams.get("story") || "")
    .replace(/[^a-z0-9-]/gi, "")
    .slice(0, 40);
  const dest = story ? `${SITE}/peta?story=${story}` : `${SITE}/peta`;
  const title = story
    ? "Kisah Kawasan · Mandum Rimba"
    : "Something worth a look on Mandum Rimba";
  const desc = story
    ? "Lihat ceritanya di peta 3D Mandum Rimba: apa yang tersisa, dan apa yang hilang."
    : "Exploring Indonesia's forests, wildlife and land — open the map and find your own.";
  const html = `<!doctype html><html lang="id"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Mandum Rimba">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1080">
<meta property="og:image:height" content="1350">
<meta property="og:url" content="${SITE}/s/${id}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${dest}">
<style>body{margin:0;background:#0b120e;color:#eae6db;font-family:-apple-system,system-ui,sans-serif;display:flex;min-height:100vh;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:32px;text-align:center}img{max-width:min(420px,92vw);border-radius:14px;box-shadow:0 20px 60px -20px #000}a{color:#57b98a;text-decoration:none;font-weight:600}</style>
</head><body>
<img src="${img}" alt="">
<a href="${dest}">${story ? "Buka ceritanya" : "Buka peta Mandum Rimba"} →</a>
<script>location.replace(${JSON.stringify(dest)})</script>
</body></html>`;
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
