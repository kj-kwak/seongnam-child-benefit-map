import { AdminError } from "./admin-auth";
const repo = () => {
  const value =
    process.env.GITHUB_REPOSITORY || "kj-kwak/seongnam-child-benefit-map";
  if (!/^[\w.-]+\/[\w.-]+$/.test(value))
    throw new AdminError("저장소 설정을 확인해주세요.", 503);
  return value;
};
export async function github<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = process.env.GITHUB_ADMIN_TOKEN;
  if (!token)
    throw new AdminError("서버용 GitHub 접근 토큰을 설정해주세요.", 503);
  const response = await fetch(
    `https://api.github.com/repos/${repo()}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) {
    if ([409, 422, 405].includes(response.status))
      throw new AdminError(
        "데이터가 변경되었거나 다른 작업이 진행 중입니다. 새로고침 후 다시 확인해주세요.",
        409,
      );
    if ([401, 403].includes(response.status))
      throw new AdminError("GitHub 접근 권한 또는 사용량을 확인해주세요.", 503);
    throw new AdminError(
      `GitHub 요청을 완료하지 못했습니다. (${response.status})`,
      502,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
const jsonCache = new Map<string, Promise<unknown>>();
export async function readJSON<T>(path: string, ref = "main"): Promise<T> {
  const resolved = /^[a-f0-9]{40}$/.test(ref) ? ref : await head(ref);
  const key = `${repo()}/${resolved}/${path}`;
  let pending = jsonCache.get(key);
  if (!pending) {
    pending = readJSONAtCommit(path, resolved).catch((e) => {
      jsonCache.delete(key);
      throw e;
    });
    jsonCache.set(key, pending);
    if (jsonCache.size > 12) jsonCache.delete(jsonCache.keys().next().value!);
  }
  return structuredClone(await pending) as T;
}
async function readJSONAtCommit(
  path: string,
  resolved: string,
): Promise<unknown> {
  // Git blobs handle the multi-megabyte catalog without the Contents API's 1 MB inline limit.
  const commit = await github<{ tree: { sha: string } }>(
    `/git/commits/${resolved}`,
  );
  const tree = await github<{
    tree: { path: string; sha: string }[];
    truncated: boolean;
  }>(`/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated)
    throw new AdminError("저장소 파일 목록이 너무 큽니다.", 502);
  const entry = tree.tree.find((x) => x.path === path);
  if (!entry) throw new AdminError("검토 파일을 찾지 못했습니다.", 404);
  const blob = await github<{ encoding: string; content: string }>(
    `/git/blobs/${entry.sha}`,
  );
  if (blob.encoding !== "base64")
    throw new AdminError("데이터 인코딩이 잘못되었습니다.", 502);
  return JSON.parse(Buffer.from(blob.content, "base64").toString("utf8"));
}
export async function head(branch = "main") {
  return (await github<{ object: { sha: string } }>(`/git/ref/heads/${branch}`))
    .object.sha;
}
export async function commitFiles(
  branch: string,
  parent: string,
  files: Record<string, unknown>,
  message: string,
) {
  const commit = await github<{ tree: { sha: string } }>(
    `/git/commits/${parent}`,
  );
  const tree = await github<{ sha: string }>("/git/trees", "POST", {
    base_tree: commit.tree.sha,
    tree: Object.entries(files).map(([path, value]) => ({
      path,
      mode: "100644",
      type: "blob",
      content: JSON.stringify(value, null, 2) + "\n",
    })),
  });
  const next = await github<{ sha: string }>("/git/commits", "POST", {
    message,
    tree: tree.sha,
    parents: [parent],
  });
  await github(`/git/refs/heads/${branch}`, "PATCH", {
    sha: next.sha,
    force: false,
  });
  return next.sha;
}
export async function withLock<T>(operation: () => Promise<T>) {
  const sha = await head();
  await github("/git/refs", "POST", {
    ref: "refs/tags/admin-operation-lock",
    sha,
  });
  try {
    return await operation();
  } finally {
    await github("/git/refs/tags/admin-operation-lock", "DELETE");
  }
}
