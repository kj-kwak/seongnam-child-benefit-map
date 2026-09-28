import { NextRequest, NextResponse } from "next/server";
import catalog from "../../../../../data/catalog.json";
import { matchKakaoPlace, placeQuery } from "@/lib/kakao-place";
import type { Store } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stores = new Map((catalog.stores as Store[]).map((store) => [store.id, store]));
const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("store") || "";
  if (!/^[a-f0-9]{24}$/.test(id))
    return NextResponse.json({ error: "가맹점 ID가 올바르지 않습니다." }, { status: 400, headers: noStore });
  const store = stores.get(id);
  if (!store) return NextResponse.json({ error: "가맹점을 찾을 수 없습니다." }, { status: 404, headers: noStore });

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return NextResponse.json({ place: null }, { headers: noStore });

  try {
    let relatedPlace: ReturnType<typeof matchKakaoPlace> = null;
    for (const fallback of [false, true]) {
      const query = placeQuery(store, fallback);
      if (!query || (fallback && query === store.name)) continue;
      const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
      url.searchParams.set("query", query);
      url.searchParams.set("x", String(store.lng));
      url.searchParams.set("y", String(store.lat));
      url.searchParams.set("radius", "500");
      url.searchParams.set("size", "15");
      const response = await fetch(url, {
        headers: { Authorization: `KakaoAK ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error(`Kakao Local ${response.status}`);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || !("documents" in payload) || !Array.isArray(payload.documents)) throw new Error("Invalid Kakao response");
      const place = matchKakaoPlace(store, payload.documents);
      if (place?.match === "exact")
        return NextResponse.json({ place }, { headers: noStore });
      if (place && !relatedPlace) relatedPlace = place;
    }
    return NextResponse.json({ place: relatedPlace }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "장소 정보를 불러오지 못했어요." }, { status: 502, headers: noStore });
  }
}
