import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Social-share card: just the logo, centered on a plain white background.
export const alt = "Mandum Rimba";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  // read at build time and inline as a data URI so Satori can rasterize it
  const svg = readFileSync(
    join(process.cwd(), "public/images/og_logo.svg"),
  ).toString("base64");
  const logo = `data:image/svg+xml;base64,${svg}`;

  // logo is 377×95 — keep the aspect ratio
  const width = 760;
  const height = Math.round((width * 95) / 377);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={width} height={height} alt="" />
      </div>
    ),
    size,
  );
}
