import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("title") };
}

export default async function AboutPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "about" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  const layers = [
    t("layer1"),
    t("layer2"),
    t("layer3"),
    t("layer4"),
    t("layer5"),
  ];
  const principles = [
    { h: t("p1Title"), b: t("p1Body") },
    { h: t("p2Title"), b: t("p2Body") },
    { h: t("p3Title"), b: t("p3Body") },
    { h: t("p4Title"), b: t("p4Body") },
  ];

  return (
    <main className="prose mx-auto max-w-[1080px] px-5">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>

      <h2>{t("nameTitle")}</h2>
      <p>{t("nameBody")}</p>

      <h2>{t("whyTitle")}</h2>
      <p>{t("whyBody")}</p>

      <h2>{t("whatTitle")}</h2>
      <p>{t("whatBody")}</p>
      <ul className="[&>li]:mb-1.5">
        {layers.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      <h2>{t("principlesTitle")}</h2>
      {principles.map((p) => (
        <div key={p.h}>
          <h3>{p.h}</h3>
          <p>{p.b}</p>
        </div>
      ))}

      <h2>{t("openTitle")}</h2>
      <p>{t("openBody")}</p>

      <p className="mt-8">
        {t("ctaLead")}{" "}
        <Link href="/peta">{tNav("map")}</Link>
        {" · "}
        <Link href="/sumber-data">{tNav("sources")}</Link>
        {" · "}
        <Link href="/apresiasi">{tNav("credits")}</Link>
      </p>
    </main>
  );
}
