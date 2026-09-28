"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Phone } from "lucide-react";
import type { KakaoPlace } from "@/lib/kakao-place";

export default function KakaoPlaceInfo({ storeId }: { storeId: string }) {
  const [place, setPlace] = useState<KakaoPlace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/kakao/place?store=${encodeURIComponent(storeId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ place: KakaoPlace | null }>;
      })
      .then((result) => setPlace(result.place))
      .catch((cause) => { if ((cause as Error).name !== "AbortError") setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [storeId]);

  return <section className="place-info" aria-label="카카오 공개 장소 정보">
    <div className="detail-section-heading"><strong>카카오 장소 정보</strong><span>실시간 검색</span></div>
    {loading && <p role="status">카카오에서 장소 정보를 확인 중이에요.</p>}
    {error && <p>장소 정보를 잠시 불러올 수 없어요.</p>}
    {!loading && !error && !place && <p>일치하는 장소 정보가 없어요. 아래 카카오맵에서 확인해 주세요.</p>}
    {place && <>
      {place.match === "same-address" && <p className="place-caution">같은 주소의 장소입니다. 상호가 달라 현재 가맹점과 동일한 곳인지는 확인이 필요해요.</p>}
      <strong className="place-name">{place.name}</strong>
      {place.category && <p>{place.category}</p>}
      {place.phone && <a className="place-phone" href={`tel:${place.phone.replace(/[^\d+]/g, "")}`}><Phone size={15} /> {place.phone}</a>}
      <a className="detail-text-link" href={place.url} target="_blank" rel="noreferrer">카카오맵 장소 상세 <ArrowUpRight size={14} /></a>
    </>}
  </section>;
}
