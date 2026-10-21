"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import styles from "./LamRimbaHero.module.css";

/** A recorded game scene; no game engine or third-party player on this page. */
export default function LamRimbaHero() {
  const english = useLocale() === "en";
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [night, setNight] = useState<boolean | null>(null);
  const asset = `/images/lam-rimba/planet${night ? "-night" : ""}`;
  const paused = useRef(false);
  const eligible = useRef(false);
  const visible = useRef(false);
  const copy = english ? {
    eyebrow: "A little adventure. A lasting love for nature.",
    title: "Care for wildlife. Bring the forest to life.",
    body: "Step into Indonesia’s forests. Help Maya and Bumi, follow animal tracks, and bring damaged habitats back to life, one small action at a time.",
    play: "Enter Lam Rimba", note: "Play free in your browser · on mobile and desktop",
    features: ["Meet Indonesia’s wildlife", "Learn as you explore", "Help the forest recover"],
    pause: "Pause background video", resume: "Play background video",
  } : {
    eyebrow: "Petualangan kecil. Cinta alam yang tumbuh.",
    title: "Rawat satwanya, hidupkan rimbanya.",
    body: "Masuk ke hutan Indonesia. Bantu Maya dan Bumi, ikuti jejak satwa, dan pulihkan habitat yang rusak, satu langkah kecil setiap kali.",
    play: "Masuk ke Lam Rimba", note: "Main gratis di browser · lewat ponsel atau komputer",
    features: ["Kenali satwa Indonesia", "Belajar sambil menjelajah", "Bantu rimba pulih kembali"],
    pause: "Jeda video latar", resume: "Putar video latar",
  };

  useEffect(() => {
    const media = window.matchMedia("(min-width: 821px) and (prefers-reduced-motion: no-preference) and (pointer: fine)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const sync = () => {
      const isNight = document.documentElement.dataset.theme === "dark";
      setNight(isNight);
      const element = video.current;
      if (!element) return;
      eligible.current = media.matches && !connection?.saveData && !/2g/.test(connection?.effectiveType ?? "");
      const source = `/images/lam-rimba/planet${isNight ? "-night" : ""}.mp4`;
      if (element.getAttribute("src") && element.getAttribute("src") !== source) {
        element.pause();
        element.removeAttribute("src");
        element.load();
        setReady(false);
      }
      if (eligible.current && visible.current && !document.hidden && !paused.current) {
        if (!element.getAttribute("src")) element.setAttribute("src", source);
        void element.play().catch(() => setPlaying(false));
      } else element.pause();
    };
    const observer = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting && entry.intersectionRatio >= 0.15; sync(); }, { threshold: 0.15 });
    if (root.current) observer.observe(root.current);
    const themeObserver = new MutationObserver(sync);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    sync();
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { themeObserver.disconnect(); observer.disconnect(); media.removeEventListener("change", sync); document.removeEventListener("visibilitychange", sync); video.current?.pause(); };
  }, []);

  return (
    <section ref={root} className={styles.section} aria-labelledby="lam-rimba-title">
      <div className={styles.hero}>
        <div className={styles.scene} aria-hidden="true">
          {night !== null && <picture>
            <source media="(max-width: 820px)" srcSet={`${asset}-mobile.webp`} />
            <img src={`${asset}.webp`} width="1440" height="900" loading="lazy" decoding="async" alt="" />
          </picture>}
          <video ref={video} muted loop playsInline preload="none" onPlaying={() => { setReady(true); setPlaying(true); }} onPause={() => setPlaying(false)} onError={() => setPlaying(false)} className={ready ? styles.playing : ""} />
        </div>
        <div className={styles.content}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <img className={styles.logo} src={night ? "/images/lam-rimba/logo-dark.svg" : "/images/lam-rimba/logo.svg"} alt="Lam Rimba" width="320" height="67" loading="lazy" />
          <h2 id="lam-rimba-title">{copy.title}</h2>
          <p className={styles.body}>{copy.body}</p>
          <a className={styles.cta} href="https://lam.mandumrimba.org/">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" fill="currentColor" /></svg>
            {copy.play}<span aria-hidden="true">→</span>
          </a>
          <p className={styles.note}>{copy.note}</p>
          <ul className={styles.features}>
            {copy.features.map((text, i) => <li key={text}>
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {i === 0 ? <><path d="M5 19C1 9 9 4 20 3c1 11-6 18-15 16Zm0 0L16 8" /><path d="m9 15 0-5m0 5h5" /></> : i === 1 ? <><path d="M7 7h10c4 0 6 11 3 12-2 1-4-3-6-3h-4c-2 0-4 4-6 3C1 18 3 7 7 7Z" /><path d="M7 10v5m-2-2h4m7-2h.01m2 3h.01" /></> : <><path d="M12 21v-9M12 13C5 14 3 9 3 5c6 0 10 2 9 8Zm0 3c7 1 10-4 9-9-6 0-10 3-9 9Z" /></>}
              </svg></span>{text}
            </li>)}
          </ul>
        </div>
        {(ready || paused.current) && <button className={styles.motion} type="button" onClick={() => { if (!video.current || !eligible.current) return; paused.current = playing; if (playing) video.current.pause(); else { if (!video.current.getAttribute("src")) video.current.setAttribute("src", `${asset}.mp4`); void video.current.play().catch(() => setPlaying(false)); } }} aria-label={playing ? copy.pause : copy.resume}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{playing ? <path d="M6 5h4v14H6zm8 0h4v14h-4z" /> : <path d="m8 5 11 7-11 7Z" />}</svg>
        </button>}
      </div>
    </section>
  );
}
