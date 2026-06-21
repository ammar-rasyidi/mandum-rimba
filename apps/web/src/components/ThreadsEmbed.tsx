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
export default function ThreadsEmbed({ urls }: { urls: string[] }) {
  useEffect(() => {
    // remove any previous instance so the script re-scans the blockquotes
    document
      .querySelectorAll(`script[src="${EMBED_SRC}"]`)
      .forEach((s) => s.remove());
    const s = document.createElement("script");
    s.src = EMBED_SRC;
    s.async = true;
    document.body.appendChild(s);
  }, [urls]);

  return (
    // embed.js swaps each blockquote for its own iframe (heights vary), so we
    // give each post its own column and top-align the row. flex-wrap keeps it a
    // neat 3-up on wide screens and reflows to fewer columns when it gets tight.
    <div className="mt-6 flex flex-wrap items-start justify-center gap-4">
      {urls.map((url) => (
        <div
          key={url}
          className="w-full min-w-0 max-w-[360px] flex-1 basis-[300px]"
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
              className="text-muted"
            >
              {url.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          </blockquote>
        </div>
      ))}
    </div>
  );
}
