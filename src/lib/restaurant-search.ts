import type { RestaurantFact, Store } from "./types";
export const CUISINES = ["한식", "중식", "일식", "양식", "패스트푸드", "뷔페", "카페·베이커리", "기타 음식점"] as const;
export type Cuisine = (typeof CUISINES)[number];
export type PriceFilter = "any" | "known" | "under10000" | "10000to20000" | "over20000";
export function cuisineOf(store: Store): Cuisine | null {
  if (store.category === "제과점·커피") return "카페·베이커리";
  if (store.category !== "음식점") return null;
  const cuisine = store.type.replace(/\s/g, "");
  if (["한식", "중식", "일식", "양식", "패스트푸드"].includes(cuisine)) return cuisine as Cuisine;
  if (cuisine === "부페" || cuisine === "뷔페") return "뷔페";
  return "기타 음식점";
}
export function matchesPrice(fact: RestaurantFact | undefined, filter: PriceFilter) {
  if (filter === "any") return true;
  const price = fact?.representativePrice;
  if (price == null) return false;
  if (filter === "known") return true;
  if (filter === "under10000") return price < 10000;
  if (filter === "10000to20000") return price >= 10000 && price < 20000;
  return price >= 20000;
}
export const formatWon = (price: number) => `${price.toLocaleString("ko-KR")}원`;
