import { createHash } from "node:crypto";
import { normalize } from "./search";
import {
  DISTRICTS,
  SOURCE_URL,
  type Catalog,
  type Change,
  type RawStore,
  type Store,
} from "./types";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const storeId = (name: string, address: string) =>
  hash(`${normalize(name)}\0${normalize(address)}`).slice(0, 24);
export function toStore(raw: RawStore & { lat: number; lng: number }): Store {
  const district = DISTRICTS.find((d) => raw.address.includes(d));
  if (!district) throw new Error("성남시 구 정보가 없는 주소입니다.");
  return {
    id: storeId(raw.name, raw.address),
    name: raw.name.trim(),
    address: raw.address.trim(),
    category: raw.category.replaceAll("/", "·"),
    type: raw.type || "",
    district,
    lat: raw.lat,
    lng: raw.lng,
  };
}
export function makeCatalog(
  stores: Store[],
  collectedAt: string | null,
  approvedAt: string | null = null,
): Catalog {
  const sorted = [...stores].sort((a, b) => a.id.localeCompare(b.id));
  return {
    metadata: {
      schemaVersion: 1,
      version: hash(JSON.stringify(sorted)).slice(0, 20),
      collectedAt,
      approvedAt,
      sourceUrl: SOURCE_URL,
      count: sorted.length,
    },
    stores: sorted,
  };
}
export function validateCatalog(
  catalog: Catalog,
  baseline?: Catalog,
): string[] {
  const errors: string[] = [];
  if (!catalog || !Array.isArray(catalog.stores) || !catalog.metadata)
    return ["데이터 형식이 잘못되었습니다."];
  if (!catalog.stores.length) errors.push("가맹점 데이터가 비어 있습니다.");
  const ids = new Set<string>();
  for (const s of catalog.stores) {
    if (
      !s ||
      typeof s.name !== "string" ||
      typeof s.address !== "string" ||
      typeof s.category !== "string" ||
      typeof s.type !== "string" ||
      !s.name.trim() ||
      !s.address.trim() ||
      !s.category.trim() ||
      !DISTRICTS.includes(s.district)
    ) {
      errors.push("필수 항목이 누락되었습니다.");
      break;
    }
    if (s.id !== storeId(s.name, s.address) || ids.has(s.id))
      errors.push("가맹점 ID가 잘못되었거나 중복되었습니다.");
    ids.add(s.id);
    if (
      !Number.isFinite(s.lat) ||
      !Number.isFinite(s.lng) ||
      s.lat < 37.25 ||
      s.lat > 37.55 ||
      s.lng < 127 ||
      s.lng > 127.25
    )
      errors.push("성남시 범위를 벗어나거나 잘못된 좌표가 있습니다.");
  }
  if (
    catalog.metadata.count !== catalog.stores.length ||
    catalog.metadata.schemaVersion !== 1 ||
    catalog.metadata.sourceUrl !== SOURCE_URL
  )
    errors.push("메타정보가 일치하지 않습니다.");
  if (
    !errors.length &&
    makeCatalog(catalog.stores, null).metadata.version !==
      catalog.metadata.version
  )
    errors.push("데이터 버전 해시가 일치하지 않습니다.");
  if (baseline && catalog.stores.length < baseline.stores.length * 0.8)
    errors.push("가맹점 수가 기존 대비 20% 넘게 감소했습니다.");
  return [...new Set(errors)];
}
export function diffCatalog(before: Catalog, after: Catalog): Change[] {
  const a = new Map(before.stores.map((s) => [s.id, s])),
    b = new Map(after.stores.map((s) => [s.id, s]));
  const changes: Change[] = [];
  for (const s of after.stores) {
    const old = a.get(s.id);
    if (!old) changes.push({ id: s.id, kind: "added", after: s });
    else if (JSON.stringify(old) !== JSON.stringify(s))
      changes.push({ id: s.id, kind: "modified", before: old, after: s });
  }
  for (const s of before.stores)
    if (!b.has(s.id)) changes.push({ id: s.id, kind: "removed", before: s });
  return changes;
}
