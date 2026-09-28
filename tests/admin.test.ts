import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, validatePaths } from "../src/lib/admin";
import { makeCatalog, toStore } from "../src/lib/catalog";
const main = "a".repeat(40),
  candidate = "b".repeat(40),
  updated = "c".repeat(40),
  old = "d".repeat(40);
const store = toStore({
  name: "가맹점",
  address: "경기 성남시 분당구 정자일로 1",
  category: "음식점",
  type: "음식점",
  lat: 37.4,
  lng: 127.12,
});
const base = makeCatalog(
    [store],
    "2026-09-01T00:00:00Z",
    "2026-09-01T01:00:00Z",
  ),
  next = makeCatalog([{ ...store, category: "식품" }], "2026-09-02T00:00:00Z");
function setup(
  options: { codeChange?: boolean; stale?: boolean; merged?: boolean } = {},
) {
  const requests: {
    path: string;
    method: string;
    body: Record<string, unknown>;
  }[] = [];
  let merged = !!options.merged;
  process.env.GITHUB_ADMIN_TOKEN = "test-token";
  process.env.GITHUB_REPOSITORY = "kj-kwak/seongnam-child-benefit-map";
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname.replace(
        "/repos/kj-kwak/seongnam-child-benefit-map",
        "",
      ),
      method = init?.method || "GET",
      body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ path, method, body });
    let result: unknown = {};
    if (path === "/git/ref/heads/main") result = { object: { sha: main } };
    else if (path === "/pulls")
      result = merged
        ? []
        : [
            {
              number: 7,
              state: "open",
              body: "",
              head: {
                sha: options.stale ? updated : candidate,
                ref: "codex/data-1",
                repo: { full_name: process.env.GITHUB_REPOSITORY },
              },
              base: { ref: "main" },
            },
          ];
    else if (path === "/commits") result = [{ sha: main }, { sha: old }];
    else if (path === "/git/commits" && method === "POST")
      result = { sha: updated };
    else if (path.startsWith("/git/commits/"))
      result = {
        tree: {
          sha: path.endsWith(candidate)
            ? "candidate"
            : path.endsWith(old)
              ? "old"
              : "main",
        },
      };
    else if (path === "/git/trees" && method === "POST")
      result = { sha: "new-tree" };
    else if (path.startsWith("/git/trees/")) {
      const which = path.split("/").pop();
      result = {
        tree: [
          { path: "data/catalog.json", sha: `catalog-${which}` },
          { path: "data/review.json", sha: "review" },
        ],
        truncated: false,
      };
    } else if (path.startsWith("/git/blobs/")) {
      const blob = path.split("/").pop();
      const value =
        blob === "review"
          ? {
              complete: true,
              errors: [],
              version: next.metadata.version,
              baseVersion: base.metadata.version,
              partitions: 93,
              expectedPartitions: 93,
            }
          : blob === "catalog-candidate" || blob === "catalog-old"
            ? next
            : base;
      result = {
        encoding: "base64",
        content: Buffer.from(JSON.stringify(value)).toString("base64"),
      };
    } else if (path === "/pulls/7/files")
      result = [
        {
          filename: options.codeChange
            ? "src/app/page.tsx"
            : "data/catalog.json",
          status: "modified",
        },
      ];
    else if (path === "/pulls/7/merge") {
      assert.equal(body.sha, updated);
      merged = true;
      result = { merged: true, sha: updated };
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return {
    requests,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
test("approval only allows the exact data file set", () => {
  assert.throws(() =>
    validatePaths([{ filename: "src/app/page.tsx", status: "modified" }]),
  );
  assert.throws(() =>
    validatePaths([{ filename: "data/catalog.json", status: "removed" }]),
  );
});
test("approval binds candidate SHA, stamps approval, merges, and releases lock", async () => {
  const mock = setup();
  try {
    const result = await applyAction({
      action: "approve",
      sha: candidate,
      number: 7,
      baseVersion: base.metadata.version,
    });
    assert.equal(result.version, next.metadata.version);
    assert.ok(mock.requests.some((r) => r.path === "/pulls/7/merge"));
    assert.ok(
      mock.requests.some(
        (r) =>
          r.path === "/git/refs/tags/admin-operation-lock" &&
          r.method === "DELETE",
      ),
    );
    await assert.rejects(
      () =>
        applyAction({
          action: "approve",
          sha: candidate,
          number: 7,
          baseVersion: base.metadata.version,
        }),
      /이미 처리/,
    );
  } finally {
    mock.restore();
  }
});
test("stale and mixed-code candidates cannot be approved", async () => {
  for (const options of [{ stale: true }, { codeChange: true }]) {
    const mock = setup(options);
    try {
      await assert.rejects(() =>
        applyAction({
          action: "approve",
          sha: candidate,
          number: 7,
          baseVersion: base.metadata.version,
        }),
      );
      assert.ok(!mock.requests.some((r) => r.path.endsWith("/merge")));
    } finally {
      mock.restore();
    }
  }
});
test("restore writes only catalog as a new descendant without force push", async () => {
  const mock = setup();
  try {
    await applyAction({
      action: "restore",
      sha: old,
      baseVersion: base.metadata.version,
    });
    const tree = mock.requests.find(
      (r) => r.path === "/git/trees" && r.method === "POST",
    );
    assert.deepEqual(
      (tree?.body.tree as { path: string }[]).map((x) => x.path),
      ["data/catalog.json"],
    );
    const ref = mock.requests.find((r) => r.path === "/git/refs/heads/main");
    assert.equal(ref?.body.force, false);
    const commit = mock.requests.find(
      (r) => r.path === "/git/commits" && r.method === "POST",
    );
    assert.deepEqual(commit?.body.parents, [main]);
  } finally {
    mock.restore();
  }
});
