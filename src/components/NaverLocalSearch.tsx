"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";

type SearchResult = {
  items: { title: string; category: string; address: string; link: string }[];
};

export default function NaverLocalSearch({ storeId, searchTerm }: { storeId: string; searchTerm: string }) {
  const [result, setResult] = useState<SearchResult | null>(null);

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
        if ((cause as Error).name !== "AbortError") setResult(null);
      });
    return () => controller.abort();
  }, [storeId]);

  return <section className="naver-local" aria-label="네이버 평점과 리뷰 확인">
      <a className="secondary naver-review-link" href={`https://search.naver.com/search.naver?query=${encodeURIComponent(searchTerm)}`} target="_blank" rel="noreferrer">네이버에서 평점·리뷰 확인 <ArrowUpRight size={15} /></a>
      <p className="naver-local-note">검색 결과에서 같은 가게인지 주소를 확인해 주세요.</p>
      {result?.items.length ? <details className="naver-related"><summary>관련 장소 검색 결과 {result.items.length}곳 <ChevronDown size={15} /></summary><ol className="naver-local-results">
          {result.items.map((item, index) => <li key={`${index}-${item.title}`}>
            {item.link ? <a href={item.link} target="_blank" rel="noreferrer"><strong>{item.title}</strong> <ArrowUpRight size={12} /></a> : <strong>{item.title}</strong>}
            {item.category && <span>{item.category}</span>}
            {item.address && <span>{item.address}</span>}
          </li>)}
        </ol></details> : null}
  </section>;
}
