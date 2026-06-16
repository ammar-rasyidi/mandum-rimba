"use client";

import { useEffect, useRef } from "react";
import { computeCrop, type Crop } from "@/lib/campaign-card";

const BOX = 140; // editor square (display + canvas resolution)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Drag-to-reposition + zoom square (1:1) crop editor, WYSIWYG with the card. */
export default function PhotoCropper({
  photo,
  crop,
  onChange,
  hint,
  zoomLabel,
}: {
  photo: HTMLImageElement;
  crop: Crop;
  onChange: (c: Crop) => void;
  hint: string;
  zoomLabel: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = BOX;
    cv.height = BOX;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, BOX, BOX);
    const { sx, sy, s } = computeCrop(photo, crop);
    ctx.drawImage(photo, sx, sy, s, s, 0, 0, BOX, BOX);
  }, [photo, crop]);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    const s = Math.min(photo.width, photo.height) / crop.zoom;
    // dragging the image moves the crop centre the opposite way
    onChange({
      ...crop,
      cx: clamp01(crop.cx - (dx * (s / BOX)) / photo.width),
      cy: clamp01(crop.cy - (dy * (s / BOX)) / photo.height),
    });
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div className="flex items-center gap-4">
      <canvas
        ref={ref}
        width={BOX}
        height={BOX}
        style={{ width: BOX, height: BOX }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="shrink-0 cursor-grab touch-none rounded-full border border-border active:cursor-grabbing"
      />
      <div className="flex-1">
        <p className="m-0 text-[0.82rem] text-muted">{hint}</p>
        <label className="mt-3 block text-[0.78rem] text-muted">
          {zoomLabel}
        </label>
        <input
          type="range"
          min={1}
          max={3}
          step={0.02}
          value={crop.zoom}
          onChange={(e) => onChange({ ...crop, zoom: Number(e.target.value) })}
          className="range mt-1"
        />
      </div>
    </div>
  );
}
