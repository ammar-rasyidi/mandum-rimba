import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { apiGet } from "@/lib/api";

export const revalidate = 300;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "status" });
  return { title: t("title") };
}

interface PipelineStatus {
  generatedAt: string;
  jobs: {
    job: string;
    lastRunAt: string | null;
    lastStatus: string | null;
    lastSuccessAt: string | null;
    staleDays: number | null;
  }[];
}

export default async function StatusPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale, namespace: "status" });
  const status = await apiGet<PipelineStatus>("/status", 300);

  const cell =
    "[&_:is(th,td)]:border-b [&_:is(th,td)]:border-border [&_:is(th,td)]:px-3 [&_:is(th,td)]:py-[0.55rem] [&_:is(th,td)]:text-left";

  return (
    <main className="prose mx-auto max-w-[60rem] px-5">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      {!status ? (
        <p>{t("unavailable")}</p>
      ) : (
        <table className={`my-6 w-full border-collapse text-[0.92rem] ${cell}`}>
          <thead>
            <tr>
              <th>{t("job")}</th>
              <th>{t("lastRun")}</th>
              <th>{t("lastSuccess")}</th>
              <th>{t("state")}</th>
            </tr>
          </thead>
          <tbody>
            {status.jobs.map((j) => (
              <tr key={j.job}>
                <td>{j.job}</td>
                <td>{j.lastRunAt?.replace("T", " ").slice(0, 16) ?? "—"}</td>
                <td>
                  {j.lastSuccessAt?.replace("T", " ").slice(0, 16) ?? "—"}
                </td>
                <td>
                  <span className={statusBadge(j.lastStatus)}>
                    {j.lastStatus ?? "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function statusBadge(state: string | null): string {
  const base =
    "inline-block rounded-full border px-[0.55rem] py-[0.1rem] text-[0.78rem]";
  if (state === "success") return `${base} border-accent-dim text-accent`;
  if (state === "failed") return `${base} border-danger text-danger`;
  return `${base} border-border text-muted`;
}
