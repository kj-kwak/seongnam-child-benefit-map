import { normalize } from "./search";
import type { RawStore } from "./types";
export function columnsToRows(value: unknown): Record<string, string>[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("원본 데이터 형식이 변경되었습니다.");
  const columns = Object.entries(value as Record<string, unknown>);
  if (!columns.length) return [];
  if (columns.some(([, v]) => !Array.isArray(v)))
    throw new Error("원본 데이터 열이 잘못되었습니다.");
  const n = (columns[0][1] as unknown[]).length;
  if (columns.some(([, v]) => (v as unknown[]).length !== n))
    throw new Error("원본 데이터 열 길이가 다릅니다.");
  return Array.from({ length: n }, (_, i) =>
    Object.fromEntries(
      columns.map(([k, v]) => [k, String((v as unknown[])[i] ?? "")]),
    ),
  );
}
export function merchantRows(
  value: unknown,
  category: string,
  district: string,
): RawStore[] {
  return columnsToRows(value).map((row) => {
    if (
      !row.MCT_NM?.trim() ||
      !row.MCT_AR?.includes("성남시") ||
      !row.MCT_AR?.includes(district)
    )
      throw new Error("원본 검색 조건과 결과가 일치하지 않습니다.");
    return {
      name: row.MCT_NM.trim(),
      address: row.MCT_AR.trim(),
      type: row.MCT_RY_NM || "",
      category,
    };
  });
}
export const addressKey = (s: string) =>
  normalize(s.split(",")[0]).replace(/^경기도 /, "경기 ");
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
export async function retryFetch(
  url: string,
  init: RequestInit = {},
  attempts = 3,
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const r = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(25000),
      });
      if (r.ok) return r;
      if (r.status !== 429 && r.status < 500)
        throw new Error(`요청 실패 (${r.status})`);
      if (attempt === attempts - 1)
        throw new Error(`요청 재시도 실패 (${r.status})`);
    } catch (e) {
      if (attempt === attempts - 1) throw e;
    }
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error("요청을 완료하지 못했습니다.");
}
