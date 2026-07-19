import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

const THREADS_URL = "https://www.threads.com/@r.rasyidi";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "privacy" });
  return { title: t("title") };
}

export default async function PrivacyPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "privacy" });
  const sections = [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t(`s${n}Title`),
    body: t(`s${n}Body`),
  }));

  return (
    <main className="prose mx-auto max-w-[62rem] px-5">
      <h1>{t("title")}</h1>
      <p className="text-[0.85rem] text-muted">{t("updated")}</p>
      <p>{t("intro")}</p>

      {sections.map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          <p>{s.body}</p>
        </section>
      ))}

      <div className="not-prose my-8 rounded-xl border border-border bg-surface p-5">
        <p className="m-0 mb-3 text-[0.92rem] leading-relaxed text-muted">
          {t("contactNote")}
        </p>
        <a
          href={THREADS_URL}
          target="_blank"
          rel="noreferrer"
          className="glass inline-flex items-center justify-center rounded-xl px-5 py-3 font-medium text-foreground no-underline transition hover:brightness-[1.04] hover:no-underline"
        >
          {t("contactCta")}
        </a>
      </div>
    </main>
  );
}
