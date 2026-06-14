export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const TILES_BASE =
  process.env.NEXT_PUBLIC_TILES_BASE_URL ?? "";

/**
 * Server-side fetch against the NestJS API. Returns null instead of throwing
 * so pages can degrade gracefully when the API is unreachable (e.g. local
 * builds without the backend running).
 */
export async function apiGet<T>(
  path: string,
  revalidateSeconds = 300,
): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}/v1${path}`, {
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
