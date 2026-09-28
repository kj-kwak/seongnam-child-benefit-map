import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import catalog from "../data/catalog.json";
import { GET } from "../src/app/api/naver/local/route";
import { placeQuery, placeSearchQuery } from "../src/lib/kakao-place";

test("NAVER lookup is store-scoped, keeps provider order, and never caches or exposes credentials", async () => {
  const food = catalog.stores.find((store) => store.category === "음식점");
  assert.ok(food);
  const originalFetch = globalThis.fetch;
  const oldId = process.env.NAVER_API_HUB_CLIENT_ID;
  const oldSecret = process.env.NAVER_API_HUB_CLIENT_SECRET;
  process.env.NAVER_API_HUB_CLIENT_ID = "test-id";
  process.env.NAVER_API_HUB_CLIENT_SECRET = "test-secret";
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.host, "naverapihub.apigw.ntruss.com");
    assert.equal(url.searchParams.get("query"), placeQuery(food));
    assert.ok(!/\d+(?:-\d+)?$/.test(url.searchParams.get("query") || ""));
    assert.equal(url.searchParams.get("display"), "5");
    assert.equal((init?.headers as Record<string, string>)["X-NCP-APIGW-API-KEY"], "test-secret");
    return Response.json({ items: [
      { title: "<b>첫째</b>", category: "한식", roadAddress: "주소 1", link: "javascript:alert(1)" },
      { title: "둘째", category: "중식", roadAddress: "주소 2", link: "https://example.com/place" },
    ] });
  };
  try {
    const bad = await GET(new NextRequest("http://localhost/api/naver/local?store=bad"));
    assert.equal(bad.status, 400);
    assert.equal(calls, 0);
    const ok = await GET(new NextRequest(`http://localhost/api/naver/local?store=${food.id}`));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("Cache-Control"), "no-store, max-age=0");
    const body = await ok.json();
    assert.deepEqual(body.items.map((item: { title: string }) => item.title), ["첫째", "둘째"]);
    assert.equal(body.items[0].link, "");
    assert.equal(body.items[1].link, "https://example.com/place");
    assert.equal(body.searchTerm, placeSearchQuery(food));
    assert.ok(!JSON.stringify(body).includes("test-secret"));
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldId === undefined) delete process.env.NAVER_API_HUB_CLIENT_ID;
    else process.env.NAVER_API_HUB_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.NAVER_API_HUB_CLIENT_SECRET;
    else process.env.NAVER_API_HUB_CLIENT_SECRET = oldSecret;
  }
});

test("NAVER lookup retries a shorter neighborhood query only after an empty result", async () => {
  const store = catalog.stores.find((item) => item.name.includes("김국진의집"));
  assert.ok(store);
  const originalFetch = globalThis.fetch;
  const oldId = process.env.NAVER_API_HUB_CLIENT_ID;
  const oldSecret = process.env.NAVER_API_HUB_CLIENT_SECRET;
  process.env.NAVER_API_HUB_CLIENT_ID = "test-id";
  process.env.NAVER_API_HUB_CLIENT_SECRET = "test-secret";
  const queries: string[] = [];
  globalThis.fetch = async (input) => {
    const query = new URL(String(input)).searchParams.get("query") || "";
    queries.push(query);
    return Response.json({ items: queries.length === 1 ? [] : [{ title: "관련 장소", roadAddress: "성남시 분당구 내정로7번길 14" }] });
  };
  try {
    const response = await GET(new NextRequest(`http://localhost/api/naver/local?store=${store.id}`));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.items[0].title, "관련 장소");
    assert.equal(queries.length, 2);
    assert.match(queries[1], /의정부부대찌개 정자동/);
    assert.equal(body.query, queries[1]);
    assert.equal(queries[0], "김국진의집 의정부부대찌개");
    assert.equal(body.searchTerm, "의정부부대찌개 성남시 정자동");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldId === undefined) delete process.env.NAVER_API_HUB_CLIENT_ID;
    else process.env.NAVER_API_HUB_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.NAVER_API_HUB_CLIENT_SECRET;
    else process.env.NAVER_API_HUB_CLIENT_SECRET = oldSecret;
  }
});
