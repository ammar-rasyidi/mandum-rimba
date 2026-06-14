import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { API_BASE } from "@/lib/api";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "data" });
  return { title: t("title") };
}

const EXPORTS = [
  { dataset: "alerts", formats: ["csv", "geojson"] },
  { dataset: "disasters", formats: ["csv", "geojson"] },
  { dataset: "forest-loss", formats: ["csv"] },
  { dataset: "discrepancies", formats: ["csv"] },
];

export default async function DataPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "data" });

  return (
    <main className="prose mx-auto max-w-[1080px] px-5">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      <ul className="[&>li]:mb-1.5">
        {EXPORTS.map((e) => (
          <li key={e.dataset}>
            <strong>{e.dataset}</strong>
            {" — "}
            {e.formats.map((f, i) => (
              <span key={f}>
                {i > 0 && " · "}
                <a
                  href={`${API_BASE}/v1/export?dataset=${e.dataset}&format=${f}`}
                >
                  {t("download")} {f.toUpperCase()}
                </a>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </main>
  );
}
