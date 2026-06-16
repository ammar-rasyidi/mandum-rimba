import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CampaignTool from "@/components/campaign/CampaignTool";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "campaign" });
  return { title: t("title"), description: t("intro") };
}

export default async function CampaignPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "campaign" });

  return (
    <main className="mx-auto max-w-[1080px] px-5 py-12">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[0.78rem] text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {t("tag")}
      </span>
      <h1 className="mb-3 mt-4 text-[2.2rem] font-bold leading-tight tracking-tight">
        {t("title")}
      </h1>
      <p className="max-w-[46rem] text-[1.05rem] leading-relaxed text-muted">
        {t("intro")}
      </p>
      <div className="mt-10">
        <CampaignTool />
      </div>
    </main>
  );
}
