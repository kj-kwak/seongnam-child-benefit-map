import type { Store } from "./types";

export function tmapDirectionsUrl(store: Pick<Store, "address" | "lat" | "lng">) {
  return `tmap://route?goalname=${encodeURIComponent(store.address)}&goalx=${store.lng}&goaly=${store.lat}`;
}
