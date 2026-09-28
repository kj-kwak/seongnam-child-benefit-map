import { test, expect, type Page } from "@playwright/test";
import catalog from "../data/catalog.json";
import restaurantFacts from "../data/restaurant-facts.json";
const numeric = catalog.stores.find((s) => /^\d/.test(s.name))!;
const pricedStore = catalog.stores.find((s) => restaurantFacts.facts[s.id as keyof typeof restaurantFacts.facts]?.representativePrice === 6500)!;
async function showMobileFilters(page: Page) {
  if ((page.viewportSize()?.width || 0) < 768) {
    const toggle = page.getByRole("button", { name: /^필터/ });
    if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  }
}
async function showMobileResults(page: Page) {
  if ((page.viewportSize()?.width || 0) < 768)
    await page.getByRole("button", { name: /곳 결과 보기$/ }).click();
}
// Existing flows explicitly verify the SDK-failure path, independent of local keys.
test.beforeEach(async ({ page }) => {
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js?*", (route) =>
    route.abort(),
  );
});
test("search, numeric store selection, share link and persistent favorite work without map SDK", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /즐겨찾기 저장/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "가맹점 이름 또는 주소 검색" })
    .fill(numeric.name);
  await expect(
    page
      .getByRole("button", {
        name: `${numeric.name} 즐겨찾기 저장`,
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `${numeric.name} 즐겨찾기 저장`, exact: true })
    .first()
    .click();
  await page.locator(".store-main").first().click();
  await expect(page).toHaveURL(/store=/);
  await expect(
    page.getByRole("link", { name: /카카오맵 길찾기/ }),
  ).toHaveAttribute("href", /^https:\/\/map.kakao.com\/link\/to\//);
  await expect(
    page.getByRole("link", { name: "티맵 앱에서 이 주소로 길찾기" }),
  ).toHaveAttribute("href", `tmap://route?goalname=${encodeURIComponent(numeric.address)}&goalx=${numeric.lng}&goaly=${numeric.lat}`);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "선택한 가맹점 상세" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "상세 닫기" }).click();
  await showMobileFilters(page);
  await page.getByRole("button", { name: /저장한 곳/ }).click();
  await showMobileResults(page);
  await expect(
    page
      .getByRole("button", {
        name: `${numeric.name} 즐겨찾기 해제`,
        exact: true,
      })
      .first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("empty results, removed favorites and map failure remain usable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "seongnam-favorites-v1",
      JSON.stringify([
        { id: "removed", name: "이전 가맹점", address: "경기 성남시 분당구" },
      ]),
    ),
  );
  await page.goto("/");
  await expect(page.getByText("지도를 잠시 불러올 수 없어요")).toBeVisible();
  await page
    .getByRole("textbox", { name: "가맹점 이름 또는 주소 검색" })
    .fill("없는가맹점xyz");
  await expect(page.getByText("조건에 맞는 사용처가 없어요")).toBeVisible();
  await showMobileFilters(page);
  await page.getByRole("button", { name: /저장한 곳/ }).click();
  await showMobileResults(page);
  await expect(page.getByText("현재 목록에서 확인되지 않음")).toBeVisible();
  await page.getByRole("button", { name: "즐겨찾기에서 제거" }).click();
  await expect(page.getByText("자주 가는 곳을 저장해보세요")).toBeVisible();
});
test("Kakao place details appear only when a matching place is found", async ({ page }) => {
  let response: { place: null | { name: string; category: string; phone: string; address: string; url: string; match: "exact" } } = { place: null };
  await page.route("**/api/kakao/place?store=*", (route) => route.fulfill({ json: response }));
  const placeRequest = () => page.waitForResponse((result) => result.url().includes("/api/kakao/place?store="));

  let request = placeRequest();
  await page.goto(`/?store=${numeric.id}`);
  await request;
  await expect(page.getByRole("region", { name: "선택한 가맹점 상세" })).toBeVisible();
  await expect(page.getByRole("region", { name: "카카오 공개 장소 정보" })).toHaveCount(0);

  response = { place: { name: numeric.name, category: "교육", phone: "031-123-4567", address: numeric.address, url: "https://place.map.kakao.com/123", match: "exact" } };
  request = placeRequest();
  await page.reload();
  await request;
  await expect(page.getByRole("region", { name: "카카오 공개 장소 정보" })).toContainText(numeric.name);
  await expect(page.getByRole("link", { name: "카카오맵 장소 상세" })).toHaveAttribute("href", "https://place.map.kakao.com/123");
});
test("restaurant discovery filters verified menu price and opens review source", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "음식점 찾기" }).click();
  if (page.viewportSize()!.width < 768) {
    const listHeight = await page.locator(".store-list").evaluate((el) => el.getBoundingClientRect().height);
    expect(listHeight).toBeGreaterThanOrEqual(120);
  }
  await showMobileFilters(page);
  await page.getByRole("textbox", { name: "가맹점 이름 또는 주소 검색" }).fill(pricedStore.name);
  await page.getByRole("combobox", { name: "대표 메뉴 가격" }).selectOption("under10000");
  await showMobileResults(page);
  await expect(page.locator(".store-card").first()).toContainText(pricedStore.name);
  await expect(page.locator(".store-card").first()).toContainText("6,500원");
  await page.locator(".store-main").first().click();
  await expect(page.getByRole("region", { name: "선택한 가맹점 상세" })).toContainText("착한가격업소");
  await expect(page.getByRole("link", { name: /카카오맵에서 .* 검색/ })).toHaveAttribute("href", /^https:\/\/map.kakao.com\/link\/search\//);
  if ((page.viewportSize()?.width || 0) < 768) await page.getByRole("button", { name: "상세 닫기" }).click();
  await showMobileFilters(page);
  await page.getByRole("combobox", { name: "대표 메뉴 가격" }).selectOption("over20000");
  await showMobileResults(page);
  await expect(page.getByText("조건에 맞는 사용처가 없어요")).toBeVisible();
});
test("external place search links use a short store name without the street address", async ({ page }) => {
  const store = catalog.stores.find((item) => item.name.includes("김국진의집"))!;
  await page.route("**/api/naver/local?store=*", (route) => route.fulfill({
    json: { query: "의정부부대찌개 정자동", searchTerm: "의정부부대찌개 성남시 정자동", items: [{ title: "의정부부대찌개", category: "음식점", address: store.address, link: "https://example.com/place" }] },
  }));
  await page.goto(`/?store=${store.id}`);
  const kakao = await page.getByRole("link", { name: /카카오맵에서 .* 검색/ }).getAttribute("href");
  const naver = await page.getByRole("link", { name: "네이버에서 평점·리뷰 확인" }).getAttribute("href");
  assertSearchTerm(kakao, "https://map.kakao.com/link/search/", "의정부부대찌개 성남시 정자동");
  assertSearchTerm(naver, "https://search.naver.com/search.naver?query=", "의정부부대찌개 성남시 정자동");
  await page.getByText("관련 장소 검색 결과 1곳").click();
  await expect(page.locator(".naver-local-results").getByRole("link", { name: /의정부부대찌개/ })).toHaveAttribute("href", "https://example.com/place");
});

function assertSearchTerm(href: string | null, prefix: string, term: string) {
  expect(href).not.toBeNull();
  expect(href!.startsWith(prefix)).toBe(true);
  expect(decodeURIComponent(href!.slice(prefix.length))).toBe(term);
}
test("restaurant cuisine filtering still works if supplemental price data fails", async ({ page }) => {
  await page.route("**/data/restaurant-facts-*.json", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "음식점 찾기" }).click();
  await showMobileFilters(page);
  await expect(page.getByText("추가 정보를 불러오지 못했어요.", { exact: false })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "대표 메뉴 가격" })).toBeDisabled();
  await expect(page.getByRole("group", { name: "음식 종류 필터" }).getByRole("button", { name: /^한식/ })).toBeVisible();
});
test("slow supplemental data does not hold up the merchant list", async ({ page }) => {
  await page.route("**/data/restaurant-facts-*.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator(".store-card").first()).toBeVisible({ timeout: 1800 });
  await page.getByRole("button", { name: "음식점 찾기" }).click();
  await showMobileFilters(page);
  await expect(page.getByRole("group", { name: "음식 종류 필터" })).toBeVisible();
});
test("unauthorized admin APIs and guessed routes are blocked", async ({
  request,
}) => {
  expect((await request.get("/api/admin")).status()).toBe(401);
  expect(
    (
      await request.post("/api/admin", { data: { action: "approve" } })
    ).status(),
  ).toBe(401);
  expect((await request.get("/guessed-admin/review")).status()).toBe(404);
});
test("secret entry issues protected session and cross-origin mutation is blocked", async ({
  page,
  context,
}) => {
  await page.goto(`/${"a".repeat(64)}/enter`);
  await expect(
    page.getByRole("heading", { name: "가맹점 데이터 관리" }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "seongnam-admin",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(cookie?.secure).toBe(true);
  const r = await page.request.post("/api/admin", {
    headers: { Origin: "https://attacker.example" },
    data: { action: "approve" },
  });
  expect(r.status()).toBe(403);
});
test("mobile list can scroll and page has no horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator(".store-card").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (testInfo.project.name === "mobile") {
    const handle = page.getByRole("button", { name: "목록 높이 조절" });
    const before = await page
      .locator(".sidebar")
      .evaluate((el) => el.getBoundingClientRect().height);
    const box = await handle.boundingBox();
    if (!box) throw new Error("Handle not visible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 140, {
      steps: 12,
    });
    await page.mouse.up();
    const after = await page
      .locator(".sidebar")
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(after).toBeGreaterThan(before + 100);
    const list = page.locator(".store-list");
    await list.evaluate((el) => {
      el.scrollTop = 200;
    });
    expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  }
});

test("mobile keeps advanced filters collapsed and shows selected conditions above a roomy list", async ({ page }, testInfo) => {
  if (testInfo.project.name !== "mobile") return;
  await page.goto("/");
  await page.getByRole("button", { name: "음식점 찾기" }).click();
  const panel = page.locator("#advanced-filters");
  await expect(panel).toBeHidden();
  const sidebarHeight = await page.locator(".sidebar").evaluate((el) => el.getBoundingClientRect().height);
  const listHeight = await page.locator(".store-list").evaluate((el) => el.getBoundingClientRect().height);
  expect(listHeight).toBeGreaterThan(sidebarHeight * 0.55);

  await showMobileFilters(page);
  await expect(panel).toBeVisible();
  await page.getByRole("group", { name: "음식 종류 필터" }).getByRole("button", { name: /^일식/ }).click();
  await showMobileResults(page);
  await expect(panel).toBeHidden();
  await expect(page.getByLabel("적용 중인 필터")).toContainText("일식");
  await expect(page.locator(".store-card").first()).toBeVisible();
});

test("data retry and denied location keep list browsing available", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          _success: unknown,
          fail: (error: unknown) => void,
        ) => fail({ code: 1 }),
      },
    }),
  );
  await page.route("**/data/manifest.json", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByText("가맹점 정보를 불러오지 못했어요.", { exact: false }),
  ).toBeVisible();
  await page.unroute("**/data/manifest.json");
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(page.locator(".store-card").first()).toBeVisible();
  await showMobileFilters(page);
  await page.getByRole("button", { name: "현재 위치 찾기" }).click();
  await expect(page.getByRole("status")).toContainText(
    "위치를 확인할 수 없어요",
  );
  await expect(page.locator(".store-card").first()).toBeVisible();
});

test("admin review paginates and searches without changing overall counts", async ({
  page,
}) => {
  await page.route("**/api/admin?*", async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("query");
    const pageNumber = Number(url.searchParams.get("page") || 0);
    const name = query
      ? "검색한 가맹점"
      : pageNumber
        ? "다음 가맹점"
        : "첫 가맹점";
    await route.fulfill({
      json: {
        current: catalog.metadata,
        candidate: {
          number: 9,
          sha: "c".repeat(40),
          metadata: catalog.metadata,
          review: null,
          errors: [],
          changes: [
            {
              id: "example",
              kind: "added",
              after: { ...catalog.stores[0], name },
            },
          ],
          counts: { added: 120, removed: 0, modified: 0 },
          totalChanges: query ? 1 : 120,
          totalFailures: 0,
          page: pageNumber,
          failurePage: 0,
          failures: [],
        },
        run: null,
        history: [],
      },
    });
  });
  await page.goto(`/${"a".repeat(64)}/enter`);
  await expect(page.getByText("첫 가맹점", { exact: true })).toBeVisible();
  await expect(page.getByText("추가 120곳", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다음 변경" }).click();
  await expect(page.getByText("다음 가맹점", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "변경 가맹점 검색" }).fill("검색");
  await expect(page.getByText("검색한 가맹점", { exact: true })).toBeVisible();
  await expect(page.getByText("추가 120곳", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "다음 변경" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "이전 변경" })).toBeDisabled();
});
