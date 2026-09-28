import { readFile, mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { validateCatalog } from "../src/lib/catalog";
const data = JSON.parse(await readFile("data/catalog.json", "utf8"));
const errors = validateCatalog(data);
if (errors.length) throw new Error(errors.join("\n"));
await mkdir("public/data", { recursive: true });
for (const file of await readdir("public/data"))
  await unlink(`public/data/${file}`);
const url = `/data/stores-${data.metadata.version}.json`;
await writeFile(`public${url}`, JSON.stringify(data.stores));
await writeFile(
  "public/data/manifest.json",
  JSON.stringify({ ...data.metadata, url }),
);
console.log(
  `공개 데이터 준비: ${data.metadata.count}개 / ${data.metadata.version}`,
);
