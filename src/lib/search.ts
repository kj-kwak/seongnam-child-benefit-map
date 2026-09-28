import type { Bounds, RestaurantFact, Store } from "./types";
import { cuisineOf, matchesPrice, type PriceFilter } from "./restaurant-search";
export const CITY_CENTER = { lat: 37.42005, lng: 127.12655 };
export const INITIAL_BOUNDS: Bounds = {
  south: 37.4,
  north: 37.44,
  west: 127.1,
  east: 127.15,
};
export const normalize = (s: string) =>
  s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function distance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const r = Math.PI / 180,
    dLat = (b.lat - a.lat) * r,
    dLng = (b.lng - a.lng) * r;
  return (
    6371000 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2,
        ),
      ),
    )
  );
}
export function searchStores(
  stores: Store[],
  options: {
    query: string;
    district: string;
    category: string;
    bounds: Bounds | null;
    favorites?: Set<string>;
    center: { lat: number; lng: number };
    food?: {
      enabled: boolean;
      cuisine: string;
      certifiedOnly: boolean;
      price: PriceFilter;
      sort: "distance" | "menuPrice";
      facts: Record<string, RestaurantFact>;
    };
  },
) {
  const query = normalize(options.query).replace(/\s/g, "");
  const base = stores.filter(
    (s) =>
      (!query ||
        normalize(s.name + " " + s.address)
          .replace(/\s/g, "")
          .includes(query)) &&
      (!options.district || s.district === options.district) &&
      (!options.favorites || options.favorites.has(s.id)) &&
      (!options.bounds ||
        (s.lat >= options.bounds.south &&
          s.lat <= options.bounds.north &&
          s.lng >= options.bounds.west &&
          s.lng <= options.bounds.east)),
  );
  const categories: Record<string, number> = {};
  for (const s of base)
    categories[s.category] = (categories[s.category] || 0) + 1;
  const foodBase = options.food?.enabled ? base.filter((s) =>
    cuisineOf(s) !== null &&
    (!options.food!.certifiedOnly || !!options.food!.facts[s.id]) &&
    matchesPrice(options.food!.facts[s.id], options.food!.price)) : [];
  const cuisines: Record<string, number> = {};
  for (const s of foodBase) {
    const cuisine = cuisineOf(s)!;
    cuisines[cuisine] = (cuisines[cuisine] || 0) + 1;
  }
  const filtered = options.food?.enabled
    ? foodBase.filter((s) => !options.food!.cuisine || cuisineOf(s) === options.food!.cuisine)
    : base.filter((s) => !options.category || s.category === options.category);
  const matches = filtered
    .map((s) => ({ s, d: distance(options.center, s) }))
    .sort((a, b) => {
      if (options.food?.enabled && options.food.sort === "menuPrice") {
        const aPrice = options.food.facts[a.s.id]?.representativePrice ?? Infinity;
        const bPrice = options.food.facts[b.s.id]?.representativePrice ?? Infinity;
        if (aPrice !== bPrice) return aPrice - bPrice;
      }
      return a.d - b.d || a.s.id.localeCompare(b.s.id);
    })
    .map((x) => x.s);
  return { matches, categories, cuisines, total: options.food?.enabled ? foodBase.length : base.length };
}
export const formatDistance = (n: number) =>
  n < 1000 ? `${Math.round(n / 10) * 10}m` : `${(n / 1000).toFixed(1)}km`;
