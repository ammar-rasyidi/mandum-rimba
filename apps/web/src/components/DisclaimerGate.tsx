"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// Bump the version suffix if the terms change materially, so returning visitors
// see the notice again.
const ACK_KEY = "mr-disclaimer-ack-v1";

/**
 * First-visit disclaimer modal. Shows the public-interest / not-an-accusation
 * notice once, requires an explicit acknowledgement, and remembers it in
 * localStorage. Client-only and gated on `mounted` so it never causes a
 * hydration mismatch (server + first client render output nothing).
 */
export default function DisclaimerGate() {
  const t = useTranslations("gate");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(ACK_KEY) !== "1") setOpen(true);
    } catch {
      // storage blocked (private mode): show it, just don't persist
      setOpen(true);
    }
  }, []);

  // lock background scroll while the modal is up
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const accept = () => {
    try {
      localStorage.setItem(ACK_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="glass relative z-[1] w-[min(520px,100%)] animate-[panel-in_0.22s_ease] rounded-[18px] p-6 text-[0.92rem]">
        <h2 className="m-0 mb-2 text-[1.15rem]">{t("title")}</h2>
        <p className="m-0 leading-relaxed text-muted">{t("body")}</p>

        <p className="m-0 mt-3 flex flex-wrap gap-x-1 gap-y-0.5 text-[0.85rem]">
          <Link href="/ketentuan" className="text-accent hover:no-underline">
            {t("readMore")}
          </Link>
          <span className="text-muted">·</span>
          <Link href="/sumber-data" className="text-accent hover:no-underline">
            {t("sources")}
          </Link>
          <span className="text-muted">·</span>
          <Link href="/metodologi" className="text-accent hover:no-underline">
            {t("methodology")}
          </Link>
          <span className="text-muted">·</span>
          <Link href="/privasi" className="text-accent hover:no-underline">
            {t("privacy")}
          </Link>
        </p>

        <button
          onClick={accept}
          className="glass mt-5 w-full cursor-pointer rounded-xl px-5 py-3 font-medium text-foreground transition hover:brightness-[1.05]"
        >
          {t("accept")}
        </button>
      </div>
    </div>
  );
}
