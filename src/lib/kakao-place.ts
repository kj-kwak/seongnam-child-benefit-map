import type { Store } from "./types";

export interface KakaoPlace {
  name: string;
  category: string;
  phone: string;
  address: string;
  url: string;
  match: "exact" | "same-address";
}

interface KakaoDocument {
  place_name?: string;
  category_name?: string;
  phone?: string;
  road_address_name?: string;
  address_name?: string;
  place_url?: string;
  x?: string;
  y?: string;
}

const compact = (value: string) => value.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
const road = (value: string) => compact(value.match(/[가-힣0-9]+(?:로|길)\s*\d+(?:-\d+)?/)?.[0] || "");

export function placeQuery(store: Store, fallback = false) {
  if (!fallback) return store.name;
  const words = store.name.trim().split(/\s+/).filter((word) => compact(word).length >= 4);
  return words.sort((a, b) => compact(b).length - compact(a).length)[0] || "";
}

export function matchKakaoPlace(store: Store, documents: KakaoDocument[]): KakaoPlace | null {
  const storeRoad = road(store.address);
  const candidates = documents.flatMap((item) => {
    const lat = Number(item.y), lng = Number(item.x);
    const name = item.place_name?.trim() || "";
    const address = item.road_address_name || item.address_name || "";
    const url = (item.place_url || "").replace(/^http:\/\//, "https://");
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || !/^https:\/\/place\.map\.kakao\.com\/\d+$/.test(url)) return [];
    const meters = Math.hypot((lat - store.lat) * 111000, (lng - store.lng) * 88000);
    const sameRoad = !!storeRoad && road(address) === storeRoad;
    if (meters > 100 || !sameRoad) return [];
    return [{ item, name, address, url, meters, match: compact(name) === compact(store.name) ? "exact" as const : "same-address" as const }];
  });
  candidates.sort((a, b) => Number(b.match === "exact") - Number(a.match === "exact") || a.meters - b.meters);
  const chosen = candidates[0];
  if (!chosen) return null;
  return {
    name: chosen.name,
    category: chosen.item.category_name || "",
    phone: chosen.item.phone || "",
    address: chosen.address,
    url: chosen.url,
    match: chosen.match,
  };
}
