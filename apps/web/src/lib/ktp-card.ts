// Renders the "Kartu Penduduk Rimba", a landscape, KTP-style resident card.
// The cardholder's photo is a person (an honorary forest citizen); the card
// features the threatened wildlife neighbour recorded nearest them. Everything
// is drawn locally; the photo never leaves the browser.

import {
  CARD_THEMES,
  computeCrop,
  roundRectPath,
  wrapLines,
  loadImage,
  FONT,
  DEFAULT_CROP,
  type Crop,
} from "./campaign-card";

// landscape card (KTP ratio ~1.58) + a slim brand footer band
export const KTP_W = 1240;
export const KTP_H = 860;

export interface KtpContent {
  province: string; // "PROVINSI RIMBA ACEH"
  republic: string; // "REPUBLIK RIMBA INDONESIA"
  kota: string; // the picked city, KTP issue place
  nik: string; // generated pseudo-NIK
  rows: { label: string; value: string }[]; // Satwa Tetangga, Nama Ilmiah, …
  wargaTag: string; // "Warga Kehormatan Rimba"
  photoLabel: string; // "PAS FOTO"
  issuedDate: string; // "20-06-2026"
  caption: string; // share caption under the card
  footer: string; // "mandumrimba.org"
}

export async function drawKtpCard(
  canvas: HTMLCanvasElement,
  theme: "dark" | "light",
  c: KtpContent,
  photo: HTMLImageElement | null,
  crop: Crop = DEFAULT_CROP,
): Promise<void> {
  const t = CARD_THEMES[theme];
  canvas.width = KTP_W;
  canvas.height = KTP_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // backdrop (theme), only the thin margin + footer show it
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, KTP_W, KTP_H);

  // ── the KTP card panel ──
  const m = 24;
  const cardX = m;
  const cardY = m;
  const cardW = KTP_W - m * 2;
  const cardH = 736;
  const pad = 54;
  const grad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
  grad.addColorStop(0, "#eef4ec");
  grad.addColorStop(1, "#dde9db");
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = grad;
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fill();
  ctx.restore();

  const ink = "#16321f";
  const inkSoft = "#4a6a55";
  const line = "rgba(22,50,31,0.14)";

  // header
  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  ctx.font = `800 38px ${FONT}`;
  ctx.fillText(c.province, cardX + cardW / 2, cardY + 64);
  ctx.fillStyle = inkSoft;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(c.republic, cardX + cardW / 2, cardY + 100);
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cardX + pad, cardY + 130);
  ctx.lineTo(cardX + cardW - pad, cardY + 130);
  ctx.stroke();

  // photo box (right), a person's portrait
  const phW = 248;
  const phH = 312;
  const phX = cardX + cardW - pad - phW;
  const phY = cardY + 170;
  ctx.save();
  roundRectPath(ctx, phX, phY, phW, phH, 14);
  ctx.clip();
  ctx.fillStyle = "#cdddca";
  ctx.fillRect(phX, phY, phW, phH);
  if (photo) {
    const { sx, sy, s } = computeCrop(photo, crop);
    const scale = Math.max(phW / s, phH / s);
    const dw = s * scale;
    const dh = s * scale;
    ctx.drawImage(
      photo,
      sx,
      sy,
      s,
      s,
      phX + (phW - dw) / 2,
      phY + (phH - dh) / 2,
      dw,
      dh,
    );
  } else {
    ctx.fillStyle = inkSoft;
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(c.photoLabel, phX + phW / 2, phY + phH / 2 + 8);
  }
  ctx.restore();
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  roundRectPath(ctx, phX, phY, phW, phH, 14);
  ctx.stroke();

  // NIK
  ctx.textAlign = "left";
  ctx.fillStyle = inkSoft;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText("NIK", cardX + pad, cardY + 186);
  ctx.fillStyle = ink;
  ctx.font = `700 38px ${FONT}`;
  ctx.fillText(c.nik, cardX + pad, cardY + 232);

  // field rows (inline KTP style: LABEL : value), left column beside the photo
  const labelX = cardX + pad;
  const valueX = cardX + pad + 296;
  const valueMaxW = phX - 36 - valueX;
  let fy = cardY + 300;
  for (const row of c.rows) {
    ctx.fillStyle = inkSoft;
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(row.label.toUpperCase(), labelX, fy);
    ctx.fillText(":", valueX - 26, fy);
    ctx.fillStyle = ink;
    ctx.font = `700 32px ${FONT}`;
    const lines = wrapLines(ctx, row.value, valueMaxW);
    let vy = fy;
    for (const ln of lines) {
      ctx.fillText(ln, valueX, vy);
      vy += 40;
    }
    fy += Math.max(58, lines.length * 40 + 18);
  }

  // honorary-citizen tag (under the field block)
  ctx.fillStyle = t.accent;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(c.wargaTag, labelX, cardY + cardH - 48);

  // issued place / date + leaf "signature" under the photo
  const sigX = phX + phW / 2;
  ctx.textAlign = "center";
  ctx.fillStyle = inkSoft;
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText(c.kota.toUpperCase(), sigX, phY + phH + 40);
  ctx.fillText(c.issuedDate, sigX, phY + phH + 72);
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(sigX - 64, phY + phH + 116);
  ctx.bezierCurveTo(
    sigX - 18,
    phY + phH + 90,
    sigX + 18,
    phY + phH + 142,
    sigX + 64,
    phY + phH + 112,
  );
  ctx.stroke();

  // ── footer band: caption + url ──
  ctx.textAlign = "left";
  ctx.fillStyle = t.text;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(c.caption, m + 8, cardY + cardH + 70);
  ctx.textAlign = "right";
  try {
    const hero = await loadImage(`/images/hero_${theme}.svg`);
    const hw = 230;
    const hh = (hero.height / hero.width) * hw;
    ctx.drawImage(hero, KTP_W - m - hw, cardY + cardH + 28, hw, hh);
  } catch {
    ctx.fillStyle = t.muted;
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(c.footer, KTP_W - m - 8, cardY + cardH + 70);
  }
  ctx.textAlign = "left";
}
