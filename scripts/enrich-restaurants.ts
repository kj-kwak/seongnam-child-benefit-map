import { readFile, writeFile } from "node:fs/promises";
import { load } from "cheerio";
import { GOODPRICE_URL, factsVersion, validateRestaurantFacts } from "../src/lib/restaurant-facts";
import type { Catalog, RestaurantFacts, RestaurantFact, Store } from "../src/lib/types";
import { normalize } from "../src/lib/search";

const SOURCE_URL = GOODPRICE_URL;
const PAGE_URL = "https://www.goodprice.go.kr/bssh/bsshList.do";
const nameKey = (value: string) => normalize(value).replace(/[^\p{L}\p{N}]/gu, "");
const streetKey = (value: string) => normalize(value).match(/[가-힣0-9]+(?:로|길)\s*\d+(?:-\d+)?/)?.[0]?.replace(/\s/g, "") || "";
const districtOf = (value: string) => ["분당구", "수정구", "중원구"].find((d) => value.includes(d));


export type PublicRestaurant = { id: string; name: string; address: string; menu: string; menuPrice: number | null };
export function parseGoodPrice(html: string): { total: number; rows: PublicRestaurant[] } {
  const $ = load(html);
  const total = Number($(".count strong").first().text().replace(/,/g, ""));
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("착한가격업소 건수를 확인하지 못했습니다.");
  const rows: PublicRestaurant[] = [];
  $(".msl_nm_wrap").each((_, element) => {
    const card = $(element).closest("li");
    const name = $(element).find(".msl_nm").text().replace(/\s+/g, " ").trim();
    const id = card.find(".msl_detail a").attr("href")?.match(/goInfo\('(\d+)'\)/)?.[1];
    const fields = new Map<string, string>();
    card.find(".field").each((_, field) => {
      $(field).find(".th").each((_, heading) => {
        fields.set($(heading).text().trim(), $(heading).next(".td").text().replace(/\s+/g, " ").trim());
      });
    });
    const address = fields.get("주소") || "";
    const menu = fields.get("주요품목") || "";
    const rawPrice = fields.get("가격") || "";
    const menuPrice = /^\d{1,3}(?:,\d{3})*원$/.test(rawPrice) ? Number(rawPrice.replace(/[^\d]/g, "")) : null;
    if (!id || !name || !address || !address.includes("성남시")) throw new Error("착한가격업소 카드 형식을 확인하지 못했습니다.");
    rows.push({ id, name, address, menu: menu === "-" ? "" : menu, menuPrice });
  });
  return { total, rows };
}
export function matchGoodPrice(stores: Store[], publicRows: PublicRestaurant[]) {
  const byName = new Map<string, Store[]>();
  for (const store of stores.filter((s) => s.category === "음식점" || s.category === "제과점·커피")) {
    const key = nameKey(store.name);
    byName.set(key, [...(byName.get(key) || []), store]);
  }
  const facts: Record<string, RestaurantFact> = {};
  const ambiguous: string[] = [];
  for (const row of publicRows) {
    const road = streetKey(row.address);
    const matches = (byName.get(nameKey(row.name)) || []).filter((s) =>
      (!districtOf(row.address) || districtOf(row.address) === s.district) && road && streetKey(s.address) === road,
    );
    if (matches.length > 1) ambiguous.push(row.id);
    if (matches.length !== 1) continue;
    const match = matches[0];
    if (facts[match.id]) { ambiguous.push(row.id); delete facts[match.id]; continue; }
    facts[match.id] = {
      designation: "착한가격업소",
      representativeMenu: row.menu || null,
      representativePrice: row.menuPrice,
      sourceUrl: SOURCE_URL,
    };
  }
  return { facts, ambiguous };
}

async function main() {
  const catalog: Catalog = JSON.parse(await readFile(process.argv[2] || "data/catalog.json", "utf8"));
  const output = process.argv[3] || "data/restaurant-facts.json";
  let total = 0, pageSize = 0;
  const rows: PublicRestaurant[] = [];
  for (let page = 1; page <= 50; page++) {
    const response = await fetch(PAGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ pageIndex: String(page), srchCtpvCd: "41", srchSggCd: "41130", pageStyle: "list", menuId: "MN-0103" }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`착한가격업소 조회 실패: ${response.status}`);
    const parsed = parseGoodPrice(await response.text());
    if (page === 1) { total = parsed.total; pageSize = parsed.rows.length; }
    if (parsed.total !== total || !pageSize || !parsed.rows.length) throw new Error("착한가격업소 일부 페이지가 누락되었습니다.");
    rows.push(...parsed.rows);
    if (rows.length >= total) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (rows.length !== total || new Set(rows.map((r) => r.id)).size !== total) throw new Error("착한가격업소 목록이 불완전하거나 중복되었습니다.");
  const { facts, ambiguous } = matchGoodPrice(catalog.stores, rows);
  const sorted = Object.fromEntries(Object.entries(facts).sort(([a], [b]) => a.localeCompare(b)));
  const collectedAt = new Date().toISOString();
  const snapshot: RestaurantFacts = {
    metadata: { version: factsVersion(sorted, collectedAt), sourceUrl: SOURCE_URL, collectedAt, publicCount: total, matchedCount: Object.keys(sorted).length, ambiguousCount: ambiguous.length },
    facts: sorted,
  };
  const errors = validateRestaurantFacts(snapshot, new Set(catalog.stores.map((s) => s.id)));
  if (errors.length) throw new Error(errors.join("; "));
  await writeFile(output, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`착한가격업소 ${total}곳 중 아동수당 가맹점 ${snapshot.metadata.matchedCount}곳 연결, 모호한 일치 ${ambiguous.length}건 제외`);
}
if (process.argv[1]?.endsWith("enrich-restaurants.ts")) void main().catch((error) => { console.error(error); process.exitCode = 1; });
