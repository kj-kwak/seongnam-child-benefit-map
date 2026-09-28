import { AdminError } from "./admin-auth";
import { github, readJSON, head, commitFiles, withLock } from "./github";
import { diffCatalog, validateCatalog } from "./catalog";
import type { Catalog, Review, RawStore } from "./types";
type PR = {
  number: number;
  state: string;
  title: string;
  body: string | null;
  head: { sha: string; ref: string; repo: { full_name: string } };
  base: { ref: string };
  merged: boolean;
  merge_commit_sha: string | null;
};
const allowed = new Set([
  "data/catalog.json",
  "data/review.json",
  "data/raw.json",
  "data/geocoding-failures.json",
]);
export function validatePaths(files: { filename: string; status: string }[]) {
  if (
    !files.length ||
    files.some(
      (f) =>
        !allowed.has(f.filename) || !["added", "modified"].includes(f.status),
    )
  )
    throw new AdminError(
      "승인 가능한 데이터 파일 외 변경이 포함되어 있습니다.",
      403,
    );
}
export async function pending() {
  const prs = await github<PR[]>("/pulls?state=open&base=main&per_page=100");
  return (
    prs
      .filter(
        (p) =>
          p.head.ref.startsWith("codex/data-") &&
          p.head.repo?.full_name ===
            (process.env.GITHUB_REPOSITORY ||
              "kj-kwak/seongnam-child-benefit-map"),
      )
      .sort((a, b) => b.number - a.number)[0] || null
  );
}
export async function history() {
  return github<
    { sha: string; commit: { message: string; committer: { date: string } } }[]
  >("/commits?path=data/catalog.json&sha=main&per_page=15");
}
export async function reviewCandidate(pr: PR, base: Catalog) {
  if (
    pr.base.ref !== "main" ||
    pr.head.repo.full_name !==
      (process.env.GITHUB_REPOSITORY || "kj-kwak/seongnam-child-benefit-map")
  )
    throw new AdminError("허용되지 않은 검토 대상입니다.", 403);
  const files = await github<{ filename: string; status: string }[]>(
    `/pulls/${pr.number}/files?per_page=100`,
  );
  validatePaths(files);
  const [catalog, review] = await Promise.all([
    readJSON<Catalog>("data/catalog.json", pr.head.sha),
    readJSON<Review>("data/review.json", pr.head.sha),
  ]);
  const errors = validateCatalog(catalog, base);
  if (
    !review.complete ||
    review.errors.length ||
    review.version !== catalog.metadata.version ||
    review.partitions !== review.expectedPartitions ||
    !review.expectedPartitions
  )
    errors.push("수집 검증을 통과하지 못했습니다.");
  if (review.baseVersion !== base.metadata.version)
    errors.push("공개 데이터가 변경되었습니다. 다음 수집 후보를 기다려주세요.");
  return { catalog, review, errors, changes: diffCatalog(base, catalog) };
}
export async function getStatus() {
  const [base, pr, runs, commits] = await Promise.all([
    readJSON<Catalog>("data/catalog.json"),
    pending(),
    github<{
      workflow_runs: {
        id: number;
        status: string;
        conclusion: string | null;
        created_at: string;
        html_url: string;
      }[];
    }>("/actions/workflows/collect.yml/runs?per_page=1"),
    history(),
  ]);
  let candidate = null;
  if (pr) {
    try {
      const r = await reviewCandidate(pr, base);
      const failures = await readJSON<{ store: RawStore; reason: string }[]>(
        "data/geocoding-failures.json",
        pr.head.sha,
      );
      candidate = {
        number: pr.number,
        sha: pr.head.sha,
        metadata: r.catalog.metadata,
        review: r.review,
        errors: r.errors,
        changes: r.changes,
        failures,
      };
    } catch (e) {
      candidate = {
        number: pr.number,
        sha: pr.head.sha,
        metadata: null,
        review: null,
        errors: [
          e instanceof AdminError ? e.message : "후보를 읽지 못했습니다.",
        ],
        changes: [],
        failures: [],
      };
    }
  }
  return {
    current: base.metadata,
    candidate,
    run: runs.workflow_runs[0] || null,
    history: commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message.split("\n")[0],
      date: c.commit.committer.date,
    })),
  };
}
export async function applyAction(input: {
  action: string;
  sha: string;
  number?: number;
  baseVersion: string;
}) {
  if (
    !/^[a-f0-9]{40}$/.test(input.sha) ||
    !/^[a-f0-9]{20}$/.test(input.baseVersion)
  )
    throw new AdminError("버전 정보가 잘못되었습니다.");
  return withLock(async () => {
    const mainSha = await head(),
      base = await readJSON<Catalog>("data/catalog.json", mainSha);
    if (base.metadata.version !== input.baseVersion)
      throw new AdminError(
        "공개 데이터가 변경되었습니다. 새로고침해주세요.",
        409,
      );
    if (input.action === "restore") {
      const commits = await history();
      if (!commits.some((c) => c.sha === input.sha))
        throw new AdminError("복구할 수 없는 버전입니다.");
      const old = await readJSON<Catalog>("data/catalog.json", input.sha);
      const errors = validateCatalog(old);
      if (errors.length) throw new AdminError(errors.join(" "));
      if (old.metadata.version === base.metadata.version)
        throw new AdminError("이미 공개 중인 버전입니다.", 409);
      old.metadata.approvedAt = new Date().toISOString();
      const commit = await commitFiles(
        "main",
        mainSha,
        { "data/catalog.json": old },
        `data: restore ${old.metadata.version}`,
      );
      return {
        version: old.metadata.version,
        commit,
        message: "복구를 승인했습니다. 재배포가 끝나면 반영됩니다.",
      };
    }
    if (
      !["approve", "reject"].includes(input.action) ||
      !Number.isSafeInteger(input.number)
    )
      throw new AdminError("지원하지 않는 요청입니다.");
    const pr = await pending();
    if (!pr || pr.number !== input.number || pr.head.sha !== input.sha)
      throw new AdminError(
        "검토 대상이 변경되었거나 이미 처리되었습니다.",
        409,
      );
    if (input.action === "reject") {
      await github(`/pulls/${pr.number}`, "PATCH", {
        state: "closed",
        body: `${pr.body || ""}\n\n<!-- review:rejected -->`,
      });
      return { message: "후보를 거절했습니다. 공개 데이터는 유지됩니다." };
    }
    const result = await reviewCandidate(pr, base);
    if (result.errors.length)
      throw new AdminError(result.errors.join(" "), 409);
    result.catalog.metadata.approvedAt = new Date().toISOString();
    const sha = await commitFiles(
      pr.head.ref,
      pr.head.sha,
      { "data/catalog.json": result.catalog },
      `data: approve ${result.catalog.metadata.version}`,
    );
    // Recheck the base immediately before merge; admin operations are serialized by the lock.
    if (
      (await readJSON<Catalog>("data/catalog.json")).metadata.version !==
      base.metadata.version
    )
      throw new AdminError("공개 데이터가 변경되어 승인을 중단했습니다.", 409);
    const merged = await github<{ merged: boolean; sha: string }>(
      `/pulls/${pr.number}/merge`,
      "PUT",
      {
        sha,
        merge_method: "squash",
        commit_title: `data: publish ${result.catalog.metadata.version}`,
      },
    );
    if (!merged.merged)
      throw new AdminError(
        "병합되지 않았습니다. 검토 상태를 새로고침해주세요.",
        409,
      );
    return {
      version: result.catalog.metadata.version,
      commit: merged.sha,
      message: "승인했습니다. 재배포가 끝나면 서비스에 반영됩니다.",
    };
  });
}
