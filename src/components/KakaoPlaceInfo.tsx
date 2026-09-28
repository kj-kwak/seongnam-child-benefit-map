"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, MapPin, Phone } from "lucide-react";
import type { KakaoPlace } from "@/lib/kakao-place";

export default function KakaoPlaceInfo({ storeId }: { storeId: string }) {
  const [place, setPlace] = useState<KakaoPlace | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/kakao/place?store=${encodeURIComponent(storeId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ place: KakaoPlace | null }>;
      })
      .then((result) => setPlace(result.place))
      .catch((cause) => { if ((cause as Error).name !== "AbortError") setPlace(null); });
    return () => controller.abort();
  }, [storeId]);

  if (!place) return null;

  return <section className="detail-card place-info" aria-label="카카오 공개 장소 정보">
    <div className="detail-card-title"><span className="detail-card-icon detail-card-icon-blue"><MapPin size={18} /></span><div><h3>카카오 장소 정보</h3><small>실시간 조회 결과</small></div></div>
    {place.match === "same-address" && <p className="place-caution">같은 주소의 장소입니다. 상호가 달라 현재 가맹점과 동일한 곳인지는 확인이 필요해요.</p>}
    <div className="place-result"><strong className="place-name">{place.name}</strong>{place.category && <span>{place.category}</span>}</div>
    {place.phone && <a className="place-phone" href={`tel:${place.phone.replace(/[^\d+]/g, "")}`}><Phone size={15} /> {place.phone}</a>}
    <a className="detail-inline-link" href={place.url} target="_blank" rel="noreferrer">카카오맵 장소 상세 <ArrowUpRight size={14} /></a>
  </section>;
}
