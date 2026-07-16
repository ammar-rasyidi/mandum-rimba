"use client";

import { useTranslations } from "next-intl";

/** Transient caption shown during the guided realm tour: the realm's name and a
 *  one-line note on the wildlife it holds. Floats top-centre, above the map. */
export default function RealmCaption({
  realm,
  onClose,
}: {
  realm: string;
  onClose: () => void;
}) {
  const t = useTranslations("map");
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[5.75rem] z-[6] flex justify-center px-4 max-[720px]:top-[5.25rem]">
      <div className="glass pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 animate-[panel-in_0.25s_ease]">
        <div className="min-w-0">
          <p className="m-0 text-[0.95rem] font-semibold text-accent">
            {t(`realms.${realm}.name`)}
          </p>
          <p className="m-0 mt-0.5 text-[0.8rem] text-muted">
            {t(`realms.${realm}.desc`)}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t("close")}
          className="shrink-0 cursor-pointer rounded-full px-1.5 text-muted transition-colors hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
