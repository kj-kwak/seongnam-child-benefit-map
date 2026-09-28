import type { Change, RawStore } from "./types";
export type GeocodingFailure = { store: RawStore; reason: string };
export function paginateReview(
  changes: Change[],
  failures: GeocodingFailure[],
  query = "",
  page = 0,
  failurePage = 0,
) {
  const q = query.trim().toLowerCase();
  const matches = changes.filter((c) =>
    `${c.before?.name || ""} ${c.after?.name || ""} ${c.before?.address || ""} ${c.after?.address || ""}`
      .toLowerCase()
      .includes(q),
  );
  const failureMatches = failures.filter((f) =>
    `${f.store.name} ${f.store.address}`.toLowerCase().includes(q),
  );
  const counts = { added: 0, removed: 0, modified: 0 };
  for (const change of changes) counts[change.kind]++;
  page = Math.max(
    0,
    Math.min(page, Math.max(0, Math.ceil(matches.length / 50) - 1)),
  );
  failurePage = Math.max(
    0,
    Math.min(
      failurePage,
      Math.max(0, Math.ceil(failureMatches.length / 50) - 1),
    ),
  );
  return {
    changes: matches.slice(page * 50, (page + 1) * 50),
    failures: failureMatches.slice(failurePage * 50, (failurePage + 1) * 50),
    counts,
    totalChanges: matches.length,
    totalFailures: failureMatches.length,
    page,
    failurePage,
  };
}
