"use client";

import { useEffect } from "react";

const EMBED_SRC = "https://www.threads.com/embed.js";

/**
 * Renders a list of Threads posts using Threads' official embed. We build the
 * blockquotes ourselves and (re)load embed.js, which scans for
 * `blockquote.text-post-media` and swaps each for the live post. If the script
 * fails (blocked, offline), each blockquote degrades to a plain link.
 *
 * Not auto-fetched: the post URLs are curated in the page, so we control exactly
 * what shows (and the order). Strip any `?xmt=...` share token before passing in.
 */
// Threads embeds share Instagram's runtime: once embed.js has loaded it exposes
// window.instgrm.Embeds.process() to (re)scan blockquotes.
type EmbedWindow = Window & {
  instgrm?: { Embeds?: { process?: () => void } };
};

export default function ThreadsEmbed({ urls }: { urls: string[] }) {
  useEffect(() => {
    const w = window as EmbedWindow;
    const process = () => {
      if (w.instgrm?.Embeds?.process) {
        w.instgrm.Embeds.process();
        return true;
      }
      return false;
    };

    // On client-side re-navigation the runtime is already loaded, so just ask it
    // to re-scan the freshly-rendered blockquotes (re-adding the <script> is a
    // no-op once loaded, which is why the posts vanished on return).
    if (process()) return;

    // First visit: inject embed.js (it auto-processes on load).
    if (!document.querySelector(`script[src="${EMBED_SRC}"]`)) {
      const s = document.createElement("script");
      s.src = EMBED_SRC;
      s.async = true;
      document.body.appendChild(s);
      return;
    }

    // Script tag present but runtime not ready yet: poll briefly, then process.
    const timer = setInterval(() => {
      if (process()) clearInterval(timer);
    }, 300);
    const stop = setTimeout(() => clearInterval(timer), 6000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [urls]);

  return (
    // embed.js swaps each blockquote for its own iframe (heights vary), so we
    // give each post its own column and top-align the row. flex-wrap keeps it a
    // neat 3-up on wide screens and reflows to fewer columns when it gets tight.
    // Masonry via CSS columns: two wide columns, each post keeps its NATURAL
    // height (never cropped) and stays whole (break-inside-avoid). The iframes
    // load async and the columns reflow automatically.
    <div className="mx-auto mt-9 max-w-[1000px] columns-1 gap-6 sm:columns-2 [column-fill:balance]">
      {urls.map((url) => (
        <div
          key={url}
          className="mb-6 break-inside-avoid rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-raised)] p-3.5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)]"
        >
          <blockquote
            className="text-post-media"
            data-text-post-permalink={url}
            data-text-post-version="0"
            style={{ background: "transparent", margin: 0, width: "100%" }}
          >
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block px-3 py-10 text-center text-[0.9rem] text-muted"
            >
              {url.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          </blockquote>
        </div>
      ))}
    </div>
  );
}
