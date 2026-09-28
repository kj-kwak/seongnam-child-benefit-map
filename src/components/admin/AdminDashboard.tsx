"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { Check, RefreshCw, ShieldCheck, Undo2, X } from "lucide-react";
import type { Change, Metadata, Review, Store, RawStore } from "@/lib/types";
type Status = {
  current: Metadata;
  candidate: {
    number: number;
    sha: string;
    metadata: Metadata | null;
    review: Review | null;
    errors: string[];
    changes: Change[];
    counts: Record<"added" | "removed" | "modified", number>;
    totalChanges: number;
    totalFailures: number;
    page: number;
    failurePage: number;
    failures: { store: RawStore; reason: string }[];
  } | null;
  run: { status: string; conclusion: string | null; created_at: string } | null;
  history: { sha: string; message: string; date: string }[];
};
type Action = {
  action: "approve" | "reject" | "restore";
  sha: string;
  number?: number;
  baseVersion: string;
};
const labels = { added: "추가", removed: "삭제", modified: "수정" };
function storeInfo(s: Store | undefined) {
  return s ? (
    <>
      <strong>{s.name}</strong>
      <p>{s.address}</p>
      <p>
        {s.category} · {s.type}
      </p>
      <p>
        {s.lat}, {s.lng}
      </p>
    </>
  ) : (
    <span>—</span>
  );
}
export default function AdminDashboard({ readOnly }: { readOnly: boolean }) {
  const [data, setData] = useState<Status | null>(null),
    [published, setPublished] = useState<Metadata | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [failurePage, setFailurePage] = useState(0),
    [confirm, setConfirm] = useState<Action | null>(null);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        query,
        page: String(page),
        failurePage: String(failurePage),
      });
      const r = await fetch(`/api/admin?${params}`, { cache: "no-store" }),
        result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if (id !== requestId.current) return;
      setData(result);
      setConfirm(null);
      const p = await fetch("/api/catalog/version", { cache: "no-store" });
      if (p.ok) setPublished(await p.json());
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, [query, page, failurePage]);
  useEffect(() => {
    const activeRequest = requestId;
    const timer = setTimeout(() => void refresh(), 300);
    return () => {
      clearTimeout(timer);
      activeRequest.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      void fetch("/api/catalog/version", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => v && setPublished(v))
        .catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, []);
  async function submit() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(confirm),
        }),
        result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage(result.message);
      setConfirm(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const candidate = data?.candidate,
    changes = candidate?.changes || [];
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <div className="eyebrow">PRIVATE · DATA OPERATIONS</div>
          <h1>가맹점 데이터 관리</h1>
          <p className="admin-subtitle">
            수집 결과를 확인하고 공개할 데이터를 결정하세요.
          </p>
        </div>
        <button className="secondary" onClick={refresh} disabled={busy}>
          <RefreshCw size={16} /> 새로고침
        </button>
      </header>
      {readOnly && (
        <div className="error-box">
          Preview에서는 조회만 가능합니다. 변경은 운영 관리자 주소에서
          진행해주세요.
        </div>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="admin-box" role="status">
          {message}
        </div>
      )}
      {!data && !error && (
        <div className="admin-box">관리 정보를 불러오고 있습니다.</div>
      )}
      {data && (
        <>
          <section className="admin-stats">
            <div className="admin-box">
              <small>최근 자동 수집</small>
              <strong>
                {data.run?.status === "completed"
                  ? data.run.conclusion === "success"
                    ? "수집 완료"
                    : "수집 실패"
                  : data.run
                    ? "수집 중"
                    : "실행 기록 없음"}
              </strong>
              <small>
                {data.run
                  ? new Date(data.run.created_at).toLocaleString("ko-KR")
                  : "매일 오전 6:17 KST 예약"}
              </small>
            </div>
            <div className="admin-box">
              <small>승인된 데이터</small>
              <strong>{data.current.count.toLocaleString()}곳</strong>
              <small>{data.current.version}</small>
            </div>
            <div className="admin-box">
              <small>서비스 반영 상태</small>
              <strong>
                {published?.version === data.current.version &&
                published?.approvedAt === data.current.approvedAt
                  ? "반영 완료"
                  : "배포 대기"}
              </strong>
              <small>
                {data.current.approvedAt
                  ? new Date(data.current.approvedAt).toLocaleString("ko-KR")
                  : "초기 자료 · 승인 기록 없음"}
              </small>
            </div>
          </section>
          <section className="admin-box">
            <div className="row between">
              <h2>검토 대기</h2>
              <ShieldCheck size={20} />
            </div>
            {!candidate ? (
              <p className="admin-subtitle">
                검토할 새 데이터가 없습니다. 수집 실패 시 현재 공개 데이터가
                유지됩니다.
              </p>
            ) : (
              <>
                <div className="row">
                  {(["added", "removed", "modified"] as const).map((kind) => (
                    <span key={kind} className={`badge ${kind}`}>
                      {labels[kind]} {candidate.counts[kind]}곳
                    </span>
                  ))}
                </div>
                <p className="admin-subtitle">
                  수집일{" "}
                  {candidate.review
                    ? new Date(candidate.review.collectedAt).toLocaleString(
                        "ko-KR",
                      )
                    : "확인 불가"}{" "}
                  · 좌표 변환 실패 {candidate.review?.geocodingFailures ?? "—"}
                  곳 · 후보 #{candidate.number}
                </p>
                {candidate.errors.map((e) => (
                  <div className="error-box" key={e}>
                    {e}
                  </div>
                ))}
                {candidate.totalFailures > 0 && (
                  <details className="error-box">
                    <summary>
                      좌표를 확인하지 못한 가맹점 {candidate.totalFailures}곳
                    </summary>
                    <div className="admin-table-scroll">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>가맹점</th>
                            <th>주소</th>
                            <th>사유</th>
                          </tr>
                        </thead>
                        <tbody>
                          {candidate.failures.map((f, i) => (
                            <tr key={i}>
                              <td>{f.store.name}</td>
                              <td>{f.store.address}</td>
                              <td>{f.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="admin-toolbar">
                      <button
                        className="secondary"
                        disabled={busy || candidate.failurePage === 0}
                        onClick={() =>
                          setFailurePage(candidate.failurePage - 1)
                        }
                      >
                        이전 실패 항목
                      </button>
                      <span>
                        {candidate.failurePage + 1} /{" "}
                        {Math.max(1, Math.ceil(candidate.totalFailures / 50))}
                      </span>
                      <button
                        className="secondary"
                        disabled={
                          busy ||
                          (candidate.failurePage + 1) * 50 >=
                            candidate.totalFailures
                        }
                        onClick={() =>
                          setFailurePage(candidate.failurePage + 1)
                        }
                      >
                        다음 실패 항목
                      </button>
                    </div>
                  </details>
                )}
                <div className="admin-toolbar">
                  <input
                    aria-label="변경 가맹점 검색"
                    placeholder="변경된 가맹점 이름·주소 검색"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(0);
                      setFailurePage(0);
                    }}
                  />
                  <button
                    className="secondary"
                    disabled={busy || readOnly}
                    onClick={() =>
                      setConfirm({
                        action: "reject",
                        sha: candidate.sha,
                        number: candidate.number,
                        baseVersion: data.current.version,
                      })
                    }
                  >
                    <X size={16} /> 거절
                  </button>
                  <button
                    className="primary"
                    disabled={busy || readOnly || candidate.errors.length > 0}
                    onClick={() =>
                      setConfirm({
                        action: "approve",
                        sha: candidate.sha,
                        number: candidate.number,
                        baseVersion: data.current.version,
                      })
                    }
                  >
                    <Check size={16} /> 전체 승인
                  </button>
                </div>
                <div className="admin-table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>변경</th>
                        <th>현재 공개 정보</th>
                        <th>수집된 정보</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <span className={`badge ${c.kind}`}>
                              {labels[c.kind]}
                            </span>
                          </td>
                          <td>{storeInfo(c.before)}</td>
                          <td>{storeInfo(c.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!changes.length && (
                  <p className="admin-subtitle">표시할 변경 내역이 없습니다.</p>
                )}
                <div className="admin-toolbar">
                  <button
                    className="secondary"
                    disabled={busy || candidate.page === 0}
                    onClick={() => setPage(candidate.page - 1)}
                  >
                    이전 변경
                  </button>
                  <span>
                    {candidate.totalChanges}건 · {candidate.page + 1} /{" "}
                    {Math.max(1, Math.ceil(candidate.totalChanges / 50))}
                  </span>
                  <button
                    className="secondary"
                    disabled={
                      busy ||
                      (candidate.page + 1) * 50 >= candidate.totalChanges
                    }
                    onClick={() => setPage(candidate.page + 1)}
                  >
                    다음 변경
                  </button>
                </div>
              </>
            )}
          </section>
          {confirm && (
            <section className="admin-confirm" role="alert">
              <strong>
                {confirm.action === "approve"
                  ? "검토한 전체 변경을 공개할까요?"
                  : confirm.action === "reject"
                    ? "이번 후보를 거절할까요?"
                    : "선택한 이전 데이터로 복구할까요?"}
              </strong>
              <p className="admin-subtitle">
                {confirm.action === "reject"
                  ? "현재 공개 데이터는 유지됩니다."
                  : "새 커밋으로 저장되며 Vercel 재배포가 완료된 뒤 반영됩니다."}
              </p>
              <div className="row">
                <button className="primary" disabled={busy} onClick={submit}>
                  {busy ? "처리 중…" : "확인"}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  취소
                </button>
              </div>
            </section>
          )}
          <section className="admin-box">
            <h2>데이터 변경 이력</h2>
            <p className="admin-subtitle">
              이전 버전 복구는 데이터만 되돌립니다. 서비스 코드는 유지됩니다.
            </p>
            {data.history.map((h, i) => (
              <div className="history-row" key={h.sha}>
                <div>
                  <strong>{h.message}</strong>
                  <p className="admin-subtitle">
                    {new Date(h.date).toLocaleString("ko-KR")} ·{" "}
                    <code>{h.sha.slice(0, 8)}</code>
                  </p>
                </div>
                {i > 0 && (
                  <button
                    className="secondary"
                    disabled={busy || readOnly}
                    onClick={() =>
                      setConfirm({
                        action: "restore",
                        sha: h.sha,
                        baseVersion: data.current.version,
                      })
                    }
                  >
                    <Undo2 size={14} /> 복구
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
