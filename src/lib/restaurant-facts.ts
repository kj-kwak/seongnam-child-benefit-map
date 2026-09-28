import { createHash } from "node:crypto";
import type { RestaurantFacts } from "./types";
export const GOODPRICE_URL = "https://www.goodprice.go.kr/bssh/bsshList.do?srchCtpvCd=41&srchSggCd=41130";
export const factsVersion = (facts: RestaurantFacts["facts"], collectedAt: string) =>
  createHash("sha256").update(JSON.stringify({ facts, collectedAt })).digest("hex").slice(0, 20);
export function validateRestaurantFacts(value: RestaurantFacts, catalogIds: Set<string>) {
  if (!value?.metadata || !value.facts || typeof value.facts !== "object") return ["음식점 추가 정보 형식이 잘못되었습니다."];
  const entries = Object.entries(value.facts);
  const errors: string[] = [];
  if (value.metadata.sourceUrl !== GOODPRICE_URL || !Number.isFinite(Date.parse(value.metadata.collectedAt)) ||
      value.metadata.matchedCount !== entries.length || !Number.isSafeInteger(value.metadata.publicCount) || value.metadata.publicCount < entries.length ||
      !Number.isSafeInteger(value.metadata.ambiguousCount) || value.metadata.ambiguousCount < 0)
    errors.push("음식점 추가 정보 출처·건수가 잘못되었습니다.");
  if (entries.some(([id, fact]) => !catalogIds.has(id) || fact.designation !== "착한가격업소" ||
    fact.sourceUrl !== GOODPRICE_URL || (fact.representativePrice !== null && (!Number.isSafeInteger(fact.representativePrice) || fact.representativePrice < 0)) ||
    (fact.representativeMenu !== null && typeof fact.representativeMenu !== "string")))
    errors.push("음식점 추가 정보 항목이 잘못되었습니다.");
  if (value.metadata.version !== factsVersion(value.facts, value.metadata.collectedAt)) errors.push("음식점 추가 정보 버전이 일치하지 않습니다.");
  return errors;
}
