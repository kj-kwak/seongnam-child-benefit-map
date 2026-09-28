import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  makeCatalog,
  toStore,
  validateCatalog,
  diffCatalog,
  storeId,
} from "../src/lib/catalog";
import { searchStores, CITY_CENTER } from "../src/lib/search";
import { cuisineOf, matchesPrice } from "../src/lib/restaurant-search";
import { matchGoodPrice } from "../scripts/enrich-restaurants";
import { columnsToRows, merchantRows } from "../src/lib/collector";
import type { Catalog } from "../src/lib/types";
const base = {
  name: "123 아이서점",
  address: "경기 성남시 분당구 정자일로 1",
  category: "교육/서점",
  type: "서점",
  lat: 37.4,
  lng: 127.12,
};
test("stable identity uses normalized names and addresses, not coordinates/categories", () => {
  assert.equal(
    storeId(" 123  아이서점 ", base.address),
    storeId("123 아이서점", base.address),
  );
  assert.equal(
    toStore(base).id,
    toStore({ ...base, lat: 37.41, category: "문구" }).id,
  );
});
test("filters include stores after index 499 and category counts share the base result", () => {
  const stores = Array.from({ length: 700 }, (_, i) =>
    toStore({
      ...base,
      name: `사용처 ${i}`,
      category: i === 650 ? "병원" : "음식점",
    }),
  );
  const result = searchStores(stores, {
    query: "사용처",
    category: "병원",
    district: "분당구",
    bounds: null,
    center: CITY_CENTER,
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].name, "사용처 650");
  assert.equal(result.categories["음식점"], 699);
  assert.equal(result.total, 700);
});
test("address search and map bounds combine; favorites filter by ID", () => {
  const store = toStore(base);
  const options = {
    query: "정자 일로",
    category: "",
    district: "",
    bounds: null,
    center: CITY_CENTER,
  };
  assert.equal(searchStores([store], options).matches.length, 1);
  assert.equal(
    searchStores([store], {
      ...options,
      bounds: { south: 0, north: 1, east: 1, west: 0 },
    }).matches.length,
    0,
  );
  assert.equal(
    searchStores([store], { ...options, favorites: new Set() }).matches.length,
    0,
  );
});
test("catalog blocks empty, duplicate, corrupt, out-of-range and >20% decrease", () => {
  const stores = Array.from({ length: 10 }, (_, i) =>
      toStore({ ...base, name: String(i) }),
    ),
    old = makeCatalog(stores, null);
  assert.deepEqual(validateCatalog(old), []);
  assert.ok(validateCatalog(makeCatalog([], null)).length);
  assert.ok(validateCatalog(makeCatalog([stores[0], stores[0]], null)).length);
  assert.ok(
    validateCatalog(makeCatalog([{ ...stores[0], lat: NaN }], null)).length,
  );
  assert.ok(validateCatalog(makeCatalog(stores.slice(0, 7), null), old).length);
  assert.deepEqual(
    validateCatalog(makeCatalog(stores.slice(0, 8), null), old),
    [],
  );
  const broken = structuredClone(old);
  broken.metadata.version = "bad";
  assert.ok(validateCatalog(broken).length);
});
test("review distinguishes modifications from additions and removals", () => {
  const a = toStore(base),
    b = toStore({ ...base, name: "다른 가게" });
  const changes = diffCatalog(
    makeCatalog([a], null),
    makeCatalog([{ ...a, category: "문구" }, b], null),
  );
  assert.deepEqual(changes.map((c) => c.kind).sort(), ["added", "modified"]);
  assert.equal(
    diffCatalog(makeCatalog([a], null), makeCatalog([], null))[0].kind,
    "removed",
  );
});
test("source parser rejects partial columns and mismatched districts", () => {
  assert.deepEqual(columnsToRows({}), []);
  assert.throws(() => columnsToRows({ name: ["a"], address: [] }));
  assert.throws(() =>
    merchantRows(
      { MCT_NM: ["가게"], MCT_AR: ["서울 강남구"] },
      "음식점",
      "분당구",
    ),
  );
  assert.equal(
    merchantRows(
      { MCT_NM: ["가게"], MCT_AR: [base.address], MCT_RY_NM: ["서점"] },
      "교육",
      "분당구",
    )[0].name,
    "가게",
  );
});
test("real catalog validates and 10k-store search stays below 300ms", () => {
  const catalog: Catalog = JSON.parse(
    readFileSync("data/catalog.json", "utf8"),
  );
  assert.deepEqual(validateCatalog(catalog), []);
  const started = performance.now();
  for (let i = 0; i < 5; i++)
    searchStores(catalog.stores, {
      query: "",
      district: "",
      category: "",
      bounds: null,
      center: CITY_CENTER,
    });
  const elapsed = (performance.now() - started) / 5;
  console.log(
    `Search average: ${elapsed.toFixed(1)}ms (${catalog.stores.length} stores)`,
  );
  assert.ok(elapsed < 300);
});

test("restaurant cuisine, official menu prices and sorted results use the same filtered set", () => {
  const stores = Array.from({ length: 700 }, (_, i) => toStore({
    ...base,
    name: `음식점 ${i}`,
    category: "음식점",
    type: i === 650 ? "중식" : "한식",
  }));
  const facts = {
    [stores[650].id]: { designation: "착한가격업소" as const, representativeMenu: "짜장면", representativePrice: 6500, sourceUrl: "https://example.test" },
  };
  const options = { query: "음식점", district: "분당구", category: "", bounds: null, center: CITY_CENTER,
    food: { enabled: true, cuisine: "중식", certifiedOnly: true, price: "under10000" as const, sort: "menuPrice" as const, facts } };
  const result = searchStores(stores, options);
  assert.equal(result.total, 1);
  assert.equal(result.cuisines["한식"], undefined);
  assert.equal(result.cuisines["중식"], 1);
  assert.deepEqual(result.matches.map((s) => s.name), ["음식점 650"]);
  const unpriced = searchStores(stores, { ...options, food: { ...options.food, certifiedOnly: false, price: "any" } });
  assert.equal(unpriced.total, 700);
  assert.equal(unpriced.cuisines["한식"], 699);
  assert.equal(searchStores(stores, { ...options, food: { ...options.food, price: "10000to20000" } }).matches.length, 0);
  assert.equal(cuisineOf(toStore({ ...base, category: "제과점·커피" })), "카페·베이커리");
  assert.equal(matchesPrice(undefined, "known"), false);
});

test("official price matching requires both exact name and road address", () => {
  const store = toStore({ ...base, name: "맛있는식당", category: "음식점", type: "한식" });
  const publicRows = [
    { id: "1", name: "맛있는식당", address: "경기 성남시 분당구 정자일로 1", menu: "백반", menuPrice: 8000 },
    { id: "2", name: "맛있는식당", address: "경기 성남시 분당구 정자일로 2", menu: "백반", menuPrice: 7000 },
  ];
  const matched = matchGoodPrice([store], publicRows);
  assert.equal(matched.facts[store.id].representativePrice, 8000);
  assert.equal(Object.keys(matched.facts).length, 1);
});

test("admin review pages large diffs without losing counts or server search", async () => {
  const { paginateReview } = await import("../src/lib/review");
  const changes = Array.from({ length: 120 }, (_, i) => ({
    id: String(i),
    kind: "added" as const,
    after: toStore({ ...base, name: `가게 ${i}` }),
  }));
  const first = paginateReview(changes, []);
  assert.equal(first.changes.length, 50);
  assert.equal(first.counts.added, 120);
  assert.equal(first.totalChanges, 120);
  assert.equal(paginateReview(changes, [], "", 2).changes.length, 20);
  const search = paginateReview(changes, [], "가게 119");
  assert.equal(search.totalChanges, 1);
  assert.equal(search.changes[0].after?.name, "가게 119");
  assert.equal(search.counts.added, 120);
});
