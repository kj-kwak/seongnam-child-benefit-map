export const SOURCE_URL =
  "https://www.shinhancard.com/mob/MOBFM204N/MOBFM204R11.shc";
export const DISTRICTS = ["분당구", "수정구", "중원구"] as const;
export type District = (typeof DISTRICTS)[number];
export interface Store {
  id: string;
  name: string;
  type: string;
  category: string;
  address: string;
  district: District;
  lat: number;
  lng: number;
}
export interface Metadata {
  schemaVersion: 1;
  version: string;
  collectedAt: string | null;
  approvedAt: string | null;
  sourceUrl: string;
  count: number;
}
export interface Catalog {
  metadata: Metadata;
  stores: Store[];
}
export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}
export interface RawStore {
  name: string;
  address: string;
  category: string;
  type: string;
}
export interface Review {
  complete: boolean;
  errors: string[];
  collectedAt: string;
  rawCount: number;
  geocodingFailures: number;
  baseVersion: string;
  version: string;
  partitions: number;
  expectedPartitions: number;
}
export interface Change {
  id: string;
  kind: "added" | "removed" | "modified";
  before?: Store;
  after?: Store;
}
