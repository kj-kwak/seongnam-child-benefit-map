import { readFile, copyFile, appendFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import type { Catalog, Review } from "../src/lib/types";
const dir = process.env.COLLECT_OUTPUT || "artifacts/collection";
const review: Review = JSON.parse(await readFile(`${dir}/review.json`, "utf8"));
if (!review.complete || review.errors.length)
  throw new Error("검증 실패 데이터는 후보로 게시할 수 없습니다.");
const baseline: Catalog = JSON.parse(
  await readFile("data/catalog.json", "utf8"),
);
const gh = (args: string[]) =>
  execFileSync("gh", args, { encoding: "utf8" }).trim();
const repo = process.env.GITHUB_REPOSITORY;
if (!repo) throw new Error("GITHUB_REPOSITORY가 필요합니다.");
const prs = JSON.parse(
  gh([
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--limit",
    "100",
    "--json",
    "number,headRefName,body,state",
  ]),
);
const marker = `<!-- data-version:${review.version} -->`;
const matching = prs.find(
  (p: { headRefName: string; body: string }) =>
    p.headRefName.startsWith("codex/data-") && p.body?.includes(marker),
);
const closeSuperseded = (keepNumber?: number) => {
  for (const p of prs.filter(
    (p: { number: number; state: string; headRefName: string }) =>
      p.state === "OPEN" &&
      p.headRefName.startsWith("codex/data-") &&
      p.number !== keepNumber,
  ))
    gh(["pr", "close", String(p.number), "--repo", repo]);
};
if (review.version === baseline.metadata.version || matching) {
  // A newer collection can return to the published/rejected version. Do not leave
  // an older, different candidate available for approval in that case.
  closeSuperseded(
    review.version !== baseline.metadata.version && matching?.state === "OPEN"
      ? matching.number
      : undefined,
  );
  console.log("이미 공개되었거나 검토한 동일 데이터입니다.");
  process.exit(0);
}
const branch = `codex/data-${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || 1}`;
execFileSync("git", ["switch", "-c", branch], { stdio: "inherit" });
for (const file of [
  "catalog.json",
  "review.json",
  "raw.json",
  "geocoding-failures.json",
])
  await copyFile(`${dir}/${file}`, `data/${file}`);
execFileSync("git", [
  "add",
  "data/catalog.json",
  "data/review.json",
  "data/raw.json",
  "data/geocoding-failures.json",
]);
execFileSync(
  "git",
  ["commit", "-m", `data: review ${review.collectedAt.slice(0, 10)}`],
  { stdio: "inherit" },
);
execFileSync("git", ["push", "origin", branch], { stdio: "inherit" });
const body = `${marker}\n\n신한카드 가맹점 수집 결과입니다. 관리자 화면에서 검토한 후 승인해주세요.\n\n- 수집 시각: ${review.collectedAt}\n- 원본: ${review.rawCount}건\n- 좌표 실패: ${review.geocodingFailures}건\n- 범위: ${review.partitions}/${review.expectedPartitions}\n- 기준 버전: ${review.baseVersion}\n\n자동 병합하지 않습니다.`;
await writeFile(`${dir}/pr-body.md`, body);
const url = gh([
  "pr",
  "create",
  "--repo",
  repo,
  "--base",
  "main",
  "--head",
  branch,
  "--title",
  `가맹점 데이터 검토 · ${review.collectedAt.slice(0, 10)}`,
  "--body-file",
  `${dir}/pr-body.md`,
]);
console.log(url);
closeSuperseded();
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `검토 후보: ${url}\n`);
