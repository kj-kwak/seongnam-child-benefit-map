import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("loaded map remains stable when bounds, selection and search update", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js?*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: readFileSync(resolve("e2e/fixtures/kakao-sdk.js"), "utf8"),
    }),
  );
  await page.goto("/");
  await expect(page.locator('[data-sdk-map="ready"]')).toBeVisible();
  await expect(page.locator(".map-pin").first()).toBeVisible();
  const firstName = await page
    .locator(".store-main strong")
    .first()
    .textContent();
  await page.locator(".store-main").first().click();
  await expect(
    page.getByRole("region", { name: "선택한 가맹점 상세" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "상세 닫기" }).click();
  await page
    .getByRole("textbox", { name: "가맹점 이름 또는 주소 검색" })
    .fill(firstName!);
  await expect(page.locator(".map-pin").first()).toBeVisible();
  await expect(page.locator('[data-sdk-map="ready"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
