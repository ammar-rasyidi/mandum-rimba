"use client";

import { useEffect, useRef } from "react";

/**
 * Lights the card under the pointer, as though you were moving a lamp across
 * them. Each child marked `.spotlight` gets its own `--mx`/`--my` in its OWN
 * coordinates, so the highlight sits under the cursor on whichever card it is
 * over rather than smearing across the row.
 *
 * Pointer-only and skipped under reduced motion, so touch devices and anyone who
 * asked for less movement just get the cards.
 */
export default function Spotlight({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    )
      return;

    const cards = Array.from(host.querySelectorAll<HTMLElement>(".spotlight"));
    let raf = 0;
    let ev: PointerEvent | null = null;

    const apply = () => {
      raf = 0;
      if (!ev) return;
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        c.style.setProperty("--mx", `${ev.clientX - r.left}px`);
        c.style.setProperty("--my", `${ev.clientY - r.top}px`);
      }
    };
    const onMove = (e: PointerEvent) => {
      ev = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const on = () => host.classList.add("spotlight-on");
    const off = () => host.classList.remove("spotlight-on");

    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerenter", on);
    host.addEventListener("pointerleave", off);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerenter", on);
      host.removeEventListener("pointerleave", off);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
