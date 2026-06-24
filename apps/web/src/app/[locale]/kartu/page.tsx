import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import KtpTool from "@/components/campaign/KtpTool";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "ktp" });
  return { title: t("title"), description: t("intro") };
}

export default async function KtpPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "ktp" });

  return (
    <main className="mx-auto max-w-[1080px] px-5 py-12">
      <h1 className="mb-3 text-[2.2rem] font-bold leading-tight tracking-tight">
        {t("title")}
      </h1>
      <p className="max-w-[46rem] text-[1.05rem] leading-relaxed text-muted">
        {t("intro")}
      </p>
      <div className="mt-10">
        <KtpTool />
      </div>
    </main>
  );
}
