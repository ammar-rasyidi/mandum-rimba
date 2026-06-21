import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// No dedicated inbox yet, contact goes to the maintainer's Threads DMs.
const CONTACT_THREADS = "https://www.threads.com/@r.rasyidi";
const CONTACT_HANDLE = "@r.rasyidi";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "project" });
  return { title: t("title") };
}

export default async function ProjectPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "project" });
  const involve = t.raw("involveItems") as { title: string; body: string }[];

  return (
    <main className="prose mx-auto max-w-[62rem] px-5">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>

      <h2 id="kode-sumber">{t("sourceTitle")}</h2>
      <p>{t("sourceBody")}</p>
      <p>{t("sourceStatus")}</p>

      <h2 id="ikut-berkontribusi">{t("involveTitle")}</h2>
      <p>{t("involveIntro")}</p>
      <ul className="[&>li]:mb-2">
        {involve.map((it) => (
          <li key={it.title}>
            <strong>{it.title}</strong>, {it.body}
          </li>
        ))}
      </ul>

      <h2>{t("contactTitle")}</h2>
      <p>
        {t("contactBody")}{" "}
        <a href={CONTACT_THREADS} target="_blank" rel="noreferrer">
          {CONTACT_HANDLE}
        </a>
        .
      </p>
    </main>
  );
}
