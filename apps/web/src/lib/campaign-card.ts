// Renders the "Tetanggaku" share card to a 1080×1920 (IG/X/FB/Threads story)
// canvas — a centered profile-style card. Everything is drawn locally; the
// user's photo never leaves the browser.

export const CARD_W = 1080;
export const CARD_H = 1920;

export interface CardTheme {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  accentDim: string;
  hero: string; // hero_url svg path
}

export const CARD_THEMES: Record<"dark" | "light", CardTheme> = {
  dark: {
    bg: "#1b1b1b",
    text: "#fafafa",
    muted: "#9e9e9e",
    accent: "#81c784",
    accentDim: "rgba(129,199,132,0.16)",
    hero: "/images/hero_url_dark.svg", // dark-theme artwork (white elements)
  },
  light: {
    bg: "#ffffff",
    text: "#1b1b1b",
    muted: "#616161",
    accent: "#2e7d32",
    accentDim: "rgba(46,125,50,0.10)",
    hero: "/images/hero_url_light.svg", // light-theme artwork (dark elements)
  },
};

/** square-crop state for the avatar: zoom ≥ 1, center fraction (cx, cy) ∈ [0,1] */
export interface Crop {
  zoom: number;
  cx: number;
  cy: number;
}
export const DEFAULT_CROP: Crop = { zoom: 1, cx: 0.5, cy: 0.5 };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** source square (sx, sy, s) of `photo` for the given crop */
export function computeCrop(
  photo: HTMLImageElement,
  crop: Crop,
): { sx: number; sy: number; s: number } {
  const iw = photo.width;
  const ih = photo.height;
  const s = Math.min(iw, ih) / crop.zoom;
  const sx = clamp(crop.cx * iw - s / 2, 0, iw - s);
  const sy = clamp(crop.cy * ih - s / 2, 0, ih - s);
  return { sx, sy, s };
}

export interface CardContent {
  eyebrow: string; // "TETANGGAKU"
  species: string; // "Orangutan Sumatra" (the big line)
  sci: string; // "Pongo abelii"
  iucn: string; // "CR"
  distance: string; // "Terakhir tercatat 23 km dari rumahku."
  comparison: string | null; // "Lebih dekat daripada ke Medan (60 km)."
  conservation: string | null; // "Kawasan lindung terdekat: TN Gunung Leuser, 40 km."
  location: string; // "dari Banda Aceh · GBIF"
  footer: string; // "mandumrimba.org"
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** circular avatar (user-adjustable 1:1 crop) with a soft drop shadow */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  photo: HTMLImageElement,
  cx: number,
  cy: number,
  size: number,
  bg: string,
  crop: Crop,
) {
  const { sx, sy, s } = computeCrop(photo, crop);
  const x = cx - size / 2;
  const y = cy - size / 2;
  const radius = size / 2;
  // shadow backing (filled with the card bg, so only the shadow shows)
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.30)";
  ctx.shadowBlur = 46;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // image, clipped to a circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(photo, sx, sy, s, s, x, y, size, size);
  ctx.restore();
}

/** soft blurred colour glow via a radial gradient (rgb like "76,175,80") */
function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgb: string,
  alpha: number,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

export async function drawCampaignCard(
  canvas: HTMLCanvasElement,
  theme: "dark" | "light",
  c: CardContent,
  photo: HTMLImageElement | null,
  crop: Crop = DEFAULT_CROP,
): Promise<void> {
  const t = CARD_THEMES[theme];
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cx = CARD_W / 2;
  const maxW = CARD_W - 160;

  // background + soft green/amber colour glows (brand colours)
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const ga = theme === "dark" ? 0.34 : 0.4; // green alpha
  const ya = theme === "dark" ? 0.28 : 0.34; // amber alpha
  blob(ctx, cx - 200, 430, 560, "76,175,80", ga); // #4CAF50 green, top
  blob(ctx, cx + 280, 1520, 520, "255,213,79", ya); // #FFD54F amber, bottom

  ctx.textAlign = "center";
  let y = 300;

  // avatar (optional, small profile-style)
  if (photo) {
    drawAvatar(ctx, photo, cx, 420, 340, t.bg, crop);
    y = 700;
  }

  // eyebrow
  ctx.fillStyle = t.accent;
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(c.eyebrow.toUpperCase(), cx, y);
  y += 96;

  // species — the big line
  ctx.fillStyle = t.text;
  ctx.font = `800 88px ${FONT}`;
  for (const ln of wrapLines(ctx, c.species, maxW)) {
    ctx.fillText(ln, cx, y);
    y += 104;
  }

  // IUCN chip + sci, centered
  y += 18;
  ctx.font = `700 34px ${FONT}`;
  const chip = c.iucn;
  const chipTW = ctx.measureText(chip).width;
  const sciText = `  ${c.sci}`;
  ctx.font = `italic 400 40px ${FONT}`;
  const sciW = ctx.measureText(sciText).width;
  const chipW = chipTW + 44;
  const totalW = chipW + sciW;
  const startX = cx - totalW / 2;
  ctx.fillStyle = t.accentDim;
  roundRectPath(ctx, startX, y - 44, chipW, 58, 14);
  ctx.fill();
  ctx.fillStyle = t.accent;
  ctx.font = `700 34px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(chip, startX + 22, y);
  ctx.fillStyle = t.muted;
  ctx.font = `italic 400 40px ${FONT}`;
  ctx.fillText(sciText, startX + chipW, y);
  ctx.textAlign = "center";
  y += 92;

  // distance
  ctx.fillStyle = t.text;
  ctx.font = `600 50px ${FONT}`;
  for (const ln of wrapLines(ctx, c.distance, maxW)) {
    ctx.fillText(ln, cx, y);
    y += 64;
  }

  // comparison
  if (c.comparison) {
    y += 12;
    ctx.fillStyle = t.muted;
    ctx.font = `400 42px ${FONT}`;
    for (const ln of wrapLines(ctx, c.comparison, maxW)) {
      ctx.fillText(ln, cx, y);
      y += 54;
    }
  }

  // nearest conservation area
  if (c.conservation) {
    y += 30;
    ctx.fillStyle = t.accent;
    ctx.font = `600 36px ${FONT}`;
    for (const ln of wrapLines(ctx, c.conservation, maxW)) {
      ctx.fillText(ln, cx, y);
      y += 48;
    }
  }

  // location
  y += 16;
  ctx.fillStyle = t.muted;
  ctx.font = `400 34px ${FONT}`;
  ctx.fillText(c.location, cx, y);

  // footer: hero artwork + url, pinned to the bottom
  try {
    const hero = await loadImage(t.hero);
    const hw = 460;
    const hh = (hero.height / hero.width) * hw;
    ctx.drawImage(hero, cx - hw / 2, CARD_H - 250 - hh, hw, hh);
  } catch {
    /* hero failed to load — footer text still renders */
  }
  ctx.fillStyle = t.muted;
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText(c.footer, cx, CARD_H - 110);
  ctx.textAlign = "left";
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
    ),
  );
}
