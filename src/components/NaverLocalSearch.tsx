"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";

type SearchResult = {
  query: string;
  items: { title: string; category: string; address: string; link: string }[];
};

export default function NaverLocalSearch({ storeId }: { storeId: string }) {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/naver/local?store=${encodeURIComponent(storeId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<SearchResult>;
      })
      .then(setResult)
      .catch((cause) => {
        if ((cause as Error).name !== "AbortError") setError("검색 결과를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [storeId, attempt]);

  return <section className="naver-local" aria-label="네이버 지역 검색 결과">
      <div className="naver-local-heading">
        <a className="naver-brand" href="https://developers.naver.com" target="_blank" rel="noreferrer">NAVER 오픈 API</a>
        <strong>관련 장소 검색</strong>
      </div>
      <p className="naver-local-note">현재 선택한 가맹점과 같은 곳인지 주소를 확인해주세요. 검색 순서와 결과는 네이버 제공 기준입니다.</p>
      {loading && <p role="status">네이버에서 찾는 중이에요.</p>}
      {error && <div role="alert"><p>{error}</p><button className="secondary" onClick={() => { setError(""); setLoading(true); setAttempt((value) => value + 1); }}>다시 시도</button></div>}
      {result && <>
        {result.items.length ? <ol className="naver-local-results">
          {result.items.map((item, index) => <li key={`${index}-${item.title}`}>
            {item.link ? <a href={item.link} target="_blank" rel="noreferrer"><strong>{item.title}</strong> <ArrowUpRight size={12} /></a> : <strong>{item.title}</strong>}
            {item.category && <span>{item.category}</span>}
            {item.address && <span>{item.address}</span>}
          </li>)}
        </ol> : <p>네이버에 관련 검색 결과가 없어요.</p>}
        <a className="naver-source" href={`https://search.naver.com/search.naver?query=${encodeURIComponent(result.query)}`} target="_blank" rel="noreferrer">네이버에서 원본 검색 보기 <ArrowUpRight size={13} /></a>
      </>}
  </section>;
}
