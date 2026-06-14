import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import MapView from "@/components/map/MapView";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "map" });
  return { title: t("title") };
}

export default function MapPage() {
  return <MapView />;
}
