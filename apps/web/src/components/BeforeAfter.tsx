"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** Before/after satellite imagery slider (two PNGs from R2 + drag handle). */
export default function BeforeAfter({
  beforeSrc,
  afterSrc,
  alt,
}: {
  beforeSrc: string;
  afterSrc: string;
  alt: string;
}) {
  const t = useTranslations("story");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50); // percent

  const move = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(98, Math.max(2, pct)));
  };

  return (
    <div
      ref={ref}
      className="relative select-none overflow-hidden rounded-lg border border-border [&_img]:block [&_img]:h-auto [&_img]:w-full"
      onPointerMove={(e) => e.buttons === 1 && move(e.clientX)}
      onPointerDown={(e) => move(e.clientX)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={beforeSrc} alt={`${alt} (${t("before")})`} draggable={false} />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={afterSrc} alt={`${alt} (${t("after")})`} draggable={false} />
      </div>
      <div
        className="absolute bottom-0 top-0 w-[3px] cursor-ew-resize bg-accent"
        style={{ left: `${pos}%` }}
      />
      <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-[0.1rem] text-[0.75rem] text-white">
        {t("before")}
      </span>
      <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-[0.1rem] text-[0.75rem] text-white">
        {t("after")}
      </span>
    </div>
  );
}
