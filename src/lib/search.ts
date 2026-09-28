import type { Bounds, Store } from "./types";
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
  const matches = base
    .filter((s) => !options.category || s.category === options.category)
    .map((s) => ({ s, d: distance(options.center, s) }))
    .sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id))
    .map((x) => x.s);
  return { matches, categories, total: base.length };
}
export const formatDistance = (n: number) =>
  n < 1000 ? `${Math.round(n / 10) * 10}m` : `${(n / 1000).toFixed(1)}km`;
