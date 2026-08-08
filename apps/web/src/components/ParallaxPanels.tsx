"use client";

import { useEffect, useRef } from "react";

export default function ParallaxPanels() {
  const terrainRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        const offset = window.scrollY;

        if (terrainRef.current) {
          const anchor = terrainRef.current.offsetTop;
          const y = Math.round(Math.min(30, Math.max(-30, (offset - anchor + 220) * 0.05)));
          terrainRef.current.style.transform = `translate3d(0,${y}px,0)`;
        }

        if (flatRef.current) {
          const anchor = flatRef.current.offsetTop;
          const y = Math.round(Math.min(20, Math.max(-20, (offset - anchor + 180) * 0.04)));
          flatRef.current.style.transform = `translate3d(0,${y}px,0)`;
        }

        rafId = null;
      });
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <section className="reveal mt-10 space-y-8 w-full">
      <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-transparent shadow-none w-full">
        <div ref={terrainRef} className="relative w-full aspect-[2926/1530] overflow-hidden rounded-[1.5rem] bg-transparent transition-transform duration-700 will-change-transform">
          <img
            src="/images/mandum_rimba_3d_terrain.png"
            alt="Peta 3D Mandum Rimba"
            className="absolute inset-0 h-full w-full object-contain"
          />
        </div>
        <div className="px-6 py-6 sm:px-8 text-center">
          <h3 className="mt-8 text-[2.2rem] font-semibold leading-[1.02] tracking-[-0.03em] text-white md:text-[2.95rem]">
            Masuk ke rimba dalam 3D.
          </h3>
          <p className="mt-4 mx-auto max-w-[40rem] text-center text-sm leading-relaxed text-white/75 sm:text-[1rem]">
            Lihat kontur, hutan, dan sungai sebagai satu medan hidup. Peta ini membuat rimba terasa dekat, nyata, dan mudah dipahami.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-transparent shadow-none w-full">
        <div ref={flatRef} className="relative w-full aspect-[2926/1530] overflow-hidden rounded-[1.5rem] bg-transparent transition-transform duration-700 will-change-transform">
          <img
            src="/images/mandum_rimba_flat_map.png"
            alt="Peta datar Mandum Rimba"
            className="absolute inset-0 h-full w-full object-contain"
          />
        </div>
        <div className="px-6 py-6 sm:px-8 text-center">
          <h3 className="mt-8 text-[1.7rem] font-semibold leading-[1.05] tracking-[-0.02em] text-white md:text-[2.2rem]">
            Cerita rimba dari sudut yang lebih jelas.
          </h3>
          <p className="mt-4 mx-auto max-w-[36rem] text-center text-sm leading-relaxed text-white/75 sm:text-[0.98rem]">
            Temukan batas hutan, konsesi, dan habitat dengan cara yang terasa alami. Peta ini memberi kamu ruang membaca wilayah seperti sebuah cerita, bukan hanya sekadar data.
          </p>
        </div>
      </div>
    </section>
  );
}
