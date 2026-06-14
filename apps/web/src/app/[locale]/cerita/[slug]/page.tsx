import { getTranslations } from "next-intl/server";
import { apiGet } from "@/lib/api";
import BeforeAfter from "@/components/BeforeAfter";

export const revalidate = 3600;

interface Story {
  slug: string;
  titleId: string;
  titleEn: string;
  bodyMdxId: string;
  bodyMdxEn: string;
  heroBeforeImg: string | null;
  heroAfterImg: string | null;
  sources: { sourceId: string; sourceUrl: string; retrievedAt: string }[];
}

/**
 * Story mode v1: hero before/after + body paragraphs from the API.
 * Full scrollytelling (per-section map flyTo via mapState snapshots) lands in
 * Phase 3 with the MDX engine.
 */
export default async function StoryPage({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}) {
  const t = await getTranslations({ locale, namespace: "story" });
  const story = await apiGet<Story>(`/stories/${slug}`, 3600);

  if (!story) {
    return (
      <main className="prose mx-auto max-w-[1080px] px-5">
        <p>{t("notFound")}</p>
      </main>
    );
  }

  const title = locale === "en" ? story.titleEn : story.titleId;
  const body = locale === "en" ? story.bodyMdxEn : story.bodyMdxId;

  return (
    <main className="prose mx-auto max-w-[1080px] px-5">
      <h1>{title}</h1>
      {story.heroBeforeImg && story.heroAfterImg && (
        <BeforeAfter
          beforeSrc={story.heroBeforeImg}
          afterSrc={story.heroAfterImg}
          alt={title}
        />
      )}
      {body
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      {story.sources.length > 0 && (
        <>
          <h2>{t("sources")}</h2>
          <ul className="[&>li]:mb-1.5">
            {story.sources.map((s, i) => (
              <li key={i}>
                <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                  {s.sourceId}
                </a>{" "}
                ({s.retrievedAt?.slice(0, 10)})
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
