import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import MapView from "@/components/map/MapView";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("biodiversity") };
}

export default function BiodiversityMapPage() {
  return <MapView group="biodiversity" />;
}
