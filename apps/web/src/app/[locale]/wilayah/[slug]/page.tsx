import { getTranslations } from "next-intl/server";
import { apiGet } from "@/lib/api";
import LossChart from "@/components/LossChart";
import { Link } from "@/i18n/navigation";

// ISR: region pages are SEO entries ("deforestasi aceh", …)
export const revalidate = 3600;

interface RegionSummary {
  region: { name: string; nameEn: string; level: string; slug: string };
  lossByYear: { year: number; lossHa: number }[];
  alertCount90d: number;
  disasterCount: number;
  concessionCount: number;
}

export default async function RegionPage({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}) {
  const t = await getTranslations({ locale, namespace: "region" });
  const summary = await apiGet<RegionSummary>(`/regions/${slug}/summary`, 3600);

  if (!summary) {
    return (
      <main className="prose mx-auto max-w-[1080px] px-5">
        <h1>{slug}</h1>
        <p>{t("notFound")}</p>
      </main>
    );
  }

  const name = locale === "en" ? summary.region.nameEn : summary.region.name;

  return (
    <main className="prose mx-auto max-w-[60rem] px-5">
      <h1>{name}</h1>

      <div className="my-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        {[
          [summary.alertCount90d, t("alerts90d")],
          [summary.disasterCount, t("disasters")],
          [summary.concessionCount, t("concessions")],
        ].map(([value, label]) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-surface p-4"
          >
            <div className="text-[1.8rem] font-bold text-accent">
              {Number(value).toLocaleString()}
            </div>
            <div className="text-[0.85rem] text-muted">{label}</div>
          </div>
        ))}
      </div>

      <h2>{t("lossPerYear")}</h2>
      {summary.lossByYear.length > 0 ? (
        <LossChart data={summary.lossByYear} />
      ) : (
        <p>—</p>
      )}
      <p>
        {t("sourceNote")} <Link href="/metodologi">→</Link>
      </p>
    </main>
  );
}
