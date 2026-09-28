import { readFile, mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { validateCatalog } from "../src/lib/catalog";
import { factsVersion, validateRestaurantFacts } from "../src/lib/restaurant-facts";
import type { RestaurantFacts } from "../src/lib/types";
const data = JSON.parse(await readFile("data/catalog.json", "utf8"));
const errors = validateCatalog(data);
if (errors.length) throw new Error(errors.join("\n"));
const restaurantFacts: RestaurantFacts = JSON.parse(await readFile("data/restaurant-facts.json", "utf8"));
const catalogIds = new Set<string>(data.stores.map((s: { id: string }) => s.id));
// A later approved catalog may remove an old store. Keep the source snapshot intact
// while publishing only facts that still point at a current merchant.
const activeFacts = Object.fromEntries(Object.entries(restaurantFacts.facts || {}).filter(([id]) => catalogIds.has(id)));
const publicFacts = {
  ...restaurantFacts,
  metadata: {
    ...restaurantFacts.metadata,
    matchedCount: Object.keys(activeFacts).length,
    version: factsVersion(activeFacts, restaurantFacts.metadata.collectedAt),
  },
  facts: activeFacts,
};
const factsErrors = validateRestaurantFacts(publicFacts, catalogIds);
if (factsErrors.length) throw new Error(factsErrors.join("\n"));
await mkdir("public/data", { recursive: true });
for (const file of await readdir("public/data"))
  await unlink(`public/data/${file}`);
const url = `/data/stores-${data.metadata.version}.json`;
const restaurantFactsUrl = `/data/restaurant-facts-${publicFacts.metadata.version}.json`;
await writeFile(`public${url}`, JSON.stringify(data.stores));
await writeFile(`public${restaurantFactsUrl}`, JSON.stringify(publicFacts));
await writeFile(
  "public/data/manifest.json",
  JSON.stringify({ ...data.metadata, url, restaurantFactsUrl }),
);
console.log(
  `공개 데이터 준비: ${data.metadata.count}개 / ${data.metadata.version}`,
);
