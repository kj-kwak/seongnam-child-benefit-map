import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  makeCatalog,
  storeId,
  toStore,
  validateCatalog,
} from "../src/lib/catalog";
import {
  addressKey,
  columnsToRows,
  merchantRows,
  retryFetch,
  sleep,
} from "../src/lib/collector";
import {
  DISTRICTS,
  SOURCE_URL,
  type Catalog,
  type RawStore,
  type Review,
  type Store,
} from "../src/lib/types";
const output = process.env.COLLECT_OUTPUT || "artifacts/collection";
const baseline: Catalog = JSON.parse(
  await readFile("data/catalog.json", "utf8"),
);
const collectedAt = new Date().toISOString();
const raw: RawStore[] = [],
  failures: { store: RawStore; reason: string }[] = [],
  errors: string[] = [];
let partitions = 0,
  expectedPartitions = 0;
const stores = new Map<string, Store>();
async function request(endpoint: string, params: Record<string, string>) {
  await sleep(400);
  const response = await retryFetch(
    `https://www.shinhancard.com/mob/MOBFM204N/${endpoint}.ajax`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: SOURCE_URL,
      },
      body: new URLSearchParams(params),
    },
  );
  const result = await response.json();
  if (result.mbw_result !== "S" || !result.mbw_json)
    throw new Error("신한카드 조회 응답을 확인하지 못했습니다.");
  return result.mbw_json;
}
try {
  const regions = columnsToRows(
    (await request("MOBFM204R0201", {})).mData_region,
  );
  const region = regions.find((r) => r.value === "경기");
  if (!region) throw new Error("경기 지역 코드를 확인하지 못했습니다.");
  const options = await request("MOBFM204R0202", { siDo: region.value });
  const districts = columnsToRows(options.mData_01).filter((x) =>
    x.value.startsWith("성남시 "),
  );
  const categories = columnsToRows(options.mData_03).filter(
    (x) => x.code && x.value,
  );
  if (
    districts.length !== 3 ||
    !DISTRICTS.every((d) => districts.some((x) => x.value === `성남시 ${d}`)) ||
    categories.length < 20
  )
    throw new Error("지역 또는 업종 목록이 불완전합니다.");
  expectedPartitions = districts.length * categories.length;
  const outcomes = await Promise.allSettled(
    (process.argv.includes("--smoke") ? districts.slice(0, 1) : districts).map(
      async (district) => {
        for (const category of process.argv.includes("--smoke")
          ? categories.slice(0, 1)
          : categories) {
          let cursor = "",
            pages = 0;
          const cursors = new Set<string>();
          do {
            if (++pages > 3000)
              throw new Error("페이지 수가 안전 한도를 초과했습니다.");
            const result = await request("MOBFM204R1101", {
              siDo: region.value,
              siGunGu: district.value,
              category: category.code,
              mchtNm: "",
              NXT_QY_KEY: cursor,
            });
            const rows = merchantRows(
              result.mchtList,
              category.value,
              district.value.replace("성남시 ", ""),
            );
            raw.push(...rows);
            cursor = String(result.NXT_QY_KEY || "").trim();
            if (cursor && (cursors.has(cursor) || !rows.length))
              throw new Error("원본 페이지가 반복되거나 누락되었습니다.");
            if (cursor) cursors.add(cursor);
          } while (cursor);
          partitions++;
          console.log(
            `수집 ${partitions}/${expectedPartitions}: ${district.value} ${category.value} (${raw.length}건)`,
          );
        }
      },
    ),
  );
  const incomplete = outcomes.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (incomplete.length)
    throw new Error(
      incomplete.map((r) => String(r.reason?.message || r.reason)).join("; "),
    );
  raw.sort((a, b) =>
    `${a.name}|${a.address}|${a.category}|${a.type}`.localeCompare(
      `${b.name}|${b.address}|${b.category}|${b.type}`,
    ),
  );
  const cache = new Map(
    baseline.stores.map((s) => [
      addressKey(s.address),
      { lat: s.lat, lng: s.lng },
    ]),
  );
  const unique = new Map(raw.map((r) => [storeId(r.name, r.address), r]));
  let missingKey = false;
  for (const [id, row] of unique) {
    const key = addressKey(row.address);
    let coords = cache.get(key);
    if (!coords) {
      if (!process.env.KAKAO_REST_API_KEY) {
        failures.push({ store: row, reason: "좌표 변환용 키 미설정" });
        missingKey = true;
        continue;
      }
      try {
        await sleep(150);
        const response = await retryFetch(
          `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(key)}`,
          {
            headers: {
              Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}`,
            },
          },
        );
        const result = await response.json();
        const point = result.documents?.[0];
        if (!point) {
          failures.push({
            store: row,
            reason: "주소에 해당하는 좌표가 없습니다.",
          });
          continue;
        }
        coords = { lat: Number(point.y), lng: Number(point.x) };
        cache.set(key, coords);
      } catch {
        errors.push("좌표 조회 중 오류가 발생했습니다. 재수집이 필요합니다.");
        failures.push({ store: row, reason: "좌표 조회 실패 또는 결과 없음" });
        continue;
      }
    }
    const store = toStore({ ...row, ...coords });
    if (validateCatalog(makeCatalog([store], null)).length) {
      failures.push({ store: row, reason: "좌표 또는 주소 검증 실패" });
      errors.push("좌표 또는 주소 검증 실패 항목이 있습니다.");
      continue;
    }
    stores.set(id, store);
  }
  if (missingKey)
    errors.push("새 주소를 처리할 KAKAO_REST_API_KEY가 필요합니다.");
} catch (e) {
  errors.push((e as Error).message);
}
const catalog = makeCatalog([...stores.values()], collectedAt);
errors.push(...validateCatalog(catalog, baseline));
if (partitions !== expectedPartitions || !expectedPartitions)
  errors.push("지역·업종·페이지 수집이 완료되지 않았습니다.");
const review: Review = {
  complete: errors.length === 0,
  errors: [...new Set(errors)],
  collectedAt,
  rawCount: raw.length,
  geocodingFailures: failures.length,
  baseVersion: baseline.metadata.version,
  version: catalog.metadata.version,
  partitions,
  expectedPartitions,
};
await mkdir(output, { recursive: true });
for (const [file, value] of Object.entries({
  "catalog.json": catalog,
  "review.json": review,
  "raw.json": raw,
  "geocoding-failures.json": failures,
}))
  await writeFile(`${output}/${file}`, JSON.stringify(value, null, 2) + "\n");
console.log(JSON.stringify(review, null, 2));
if (!review.complete) process.exitCode = 1;
