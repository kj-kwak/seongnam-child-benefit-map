import { NextRequest, NextResponse } from "next/server";
import catalog from "../../../../../data/catalog.json";
import type { Store } from "@/lib/types";
import { placeQuery } from "@/lib/kakao-place";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stores = new Map((catalog.stores as Store[]).map((store) => [store.id, store]));
const noStore = { "Cache-Control": "no-store, max-age=0" };
function safeLink(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch { return ""; }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("store") || "";
  if (!/^[a-f0-9]{24}$/.test(id))
    return NextResponse.json({ error: "가맹점 ID가 올바르지 않습니다." }, { status: 400, headers: noStore });

  const store = stores.get(id);
  if (!store || (store.category !== "음식점" && store.category !== "제과점·커피"))
    return NextResponse.json({ error: "음식점을 찾을 수 없습니다." }, { status: 404, headers: noStore });

  const clientId = process.env.NAVER_API_HUB_CLIENT_ID;
  const clientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return NextResponse.json({ error: "네이버 검색을 준비 중입니다." }, { status: 503, headers: noStore });

  const street = store.address.match(/[가-힣0-9]+(?:로|길)\s*\d+(?:-\d+)?/)?.[0] || "";
  const query = `성남시 ${store.district} ${store.name}${street ? ` ${street}` : ""}`;
  const neighborhood = store.address.match(/\(([가-힣]+동)\)/)?.[1] || store.district;
  const fallback = `${placeQuery(store, true) || store.name} ${neighborhood}`;
  try {
    for (const searchQuery of [query, fallback]) {
      const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
      url.searchParams.set("query", searchQuery);
      url.searchParams.set("display", "5");
      const response = await fetch(url, {
        headers: {
          "X-NCP-APIGW-API-KEY-ID": clientId,
          "X-NCP-APIGW-API-KEY": clientSecret,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`NAVER API HUB ${response.status}`);
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items)) throw new Error("Invalid NAVER response");
      const items = data.items.slice(0, 5).map((item: Record<string, unknown>) => ({
        title: typeof item.title === "string" ? item.title.replace(/<\/?b>/gi, "") : "",
        category: typeof item.category === "string" ? item.category : "",
        address: typeof item.roadAddress === "string" && item.roadAddress ? item.roadAddress : typeof item.address === "string" ? item.address : "",
        link: safeLink(item.link),
      }));
      if (items.length || searchQuery === fallback) return NextResponse.json({ query: searchQuery, items }, { headers: noStore });
    }
    return NextResponse.json({ query, items: [] }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "네이버 검색 결과를 불러오지 못했어요." }, { status: 502, headers: noStore });
  }
}
