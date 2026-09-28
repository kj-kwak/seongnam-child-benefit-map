import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import catalog from "../data/catalog.json";
import { matchKakaoPlace, placeQuery, placeSearchQuery } from "../src/lib/kakao-place";
import { GET } from "../src/app/api/kakao/place/route";
import type { Store } from "../src/lib/types";

const store = catalog.stores.find((item) => item.name.includes("김국진의집")) as Store;

test("Kakao place lookup labels renamed places and rejects unrelated coordinates or addresses", () => {
  assert.ok(store);
  assert.equal(placeQuery(store), "김국진의집 의정부부대찌개");
  assert.equal(placeQuery(store, true), "의정부부대찌개");
  assert.equal(placeSearchQuery(store), "의정부부대찌개 성남시 정자동");
  const related = {
    place_name: "명품의정부부대찌개",
    category_name: "음식점 > 한식",
    phone: "031-714-8869",
    road_address_name: "경기 성남시 분당구 내정로7번길 14",
    place_url: "http://place.map.kakao.com/620303594",
    x: "127.113164864477",
    y: "37.3608097468851",
  };
  assert.equal(matchKakaoPlace(store, [related])?.match, "same-address");
  assert.equal(matchKakaoPlace(store, [related])?.url, "https://place.map.kakao.com/620303594");
  assert.equal(matchKakaoPlace(store, [{ ...related, place_name: store.name }])?.match, "exact");
  assert.equal(matchKakaoPlace(store, [{ ...related, road_address_name: "내정로7번길 16" }]), null);
  assert.equal(matchKakaoPlace(store, [{ ...related, x: "128.113164864477" }]), null);
  assert.equal(matchKakaoPlace(store, [{ ...related, place_url: "javascript:alert(1)" }]), null);
});

test("Kakao route uses only a catalog store ID and never exposes the server key", async () => {
  const previousKey = process.env.KAKAO_REST_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.KAKAO_REST_API_KEY = "test-private-key";
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.host, "dapi.kakao.com");
    assert.equal((init?.headers as Record<string, string>).Authorization, "KakaoAK test-private-key");
    return Response.json({ documents: [{
      place_name: "명품의정부부대찌개",
      road_address_name: "경기 성남시 분당구 내정로7번길 14",
      place_url: "http://place.map.kakao.com/620303594",
      x: "127.113164864477", y: "37.3608097468851",
    }] });
  };
  try {
    const invalid = await GET(new NextRequest("http://localhost/api/kakao/place?store=invalid"));
    assert.equal(invalid.status, 400);
    assert.equal(calls, 0);
    const response = await GET(new NextRequest(`http://localhost/api/kakao/place?store=${store.id}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
    const body = await response.json();
    assert.equal(body.place.match, "same-address");
    assert.ok(!JSON.stringify(body).includes("test-private-key"));
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = previousKey;
  }
});
