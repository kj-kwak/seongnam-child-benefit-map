"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Supercluster from "supercluster";
import {
  Map as KakaoCanvas,
  CustomOverlayMap,
  MapMarker,
} from "react-kakao-maps-sdk";
import { Crosshair, MapPinned, RefreshCw } from "lucide-react";
import { CITY_CENTER, INITIAL_BOUNDS } from "@/lib/search";
import type { Bounds, Store } from "@/lib/types";
type Props = {
  stores: Store[];
  selected: Store | null;
  onSelect: (store: Store) => void;
  onBounds: (bounds: Bounds, center: { lat: number; lng: number }) => void;
  onSearchArea: () => void;
  moved: boolean;
  position: { lat: number; lng: number } | null;
  onLocate: () => void;
};
let sdkPromise: Promise<void> | null = null;
function loadSDK(key: string) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    const timer = setTimeout(
      () => reject(new Error("지도 응답 시간이 초과되었습니다.")),
      12000,
    );
    script.onload = () => {
      if (!window.kakao?.maps) {
        clearTimeout(timer);
        reject(new Error("지도 인증을 확인해주세요."));
        return;
      }
      window.kakao.maps.load(() => {
        clearTimeout(timer);
        resolve();
      });
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("지도에 연결하지 못했습니다."));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}
export default function KakaoMap(props: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const key = process.env.NEXT_PUBLIC_KAKAO_API_KEY;
  useEffect(() => {
    let active = true;
    if (!key) {
      setStatus("failed");
      return;
    }
    setStatus("loading");
    loadSDK(key)
      .then(() => active && setStatus("ready"))
      .catch(() => active && setStatus("failed"));
    return () => {
      active = false;
    };
  }, [key, attempt]);
  if (status !== "ready")
    return (
      <div className="map-fallback">
        <div className="map-streets" aria-hidden="true" />
        <div className="map-fallback-card">
          <MapPinned size={32} />
          <h2>
            {status === "loading"
              ? "우리 동네 지도를 불러오는 중"
              : "지도를 잠시 불러올 수 없어요"}
          </h2>
          <p>
            {status === "loading"
              ? "가까운 사용처를 준비하고 있어요."
              : "목록에서 가맹점을 검색하고 길찾기를 이용할 수 있어요."}
          </p>
          {status === "failed" && key && (
            <button
              className="secondary"
              onClick={() => setAttempt((a) => a + 1)}
            >
              <RefreshCw size={16} /> 다시 시도
            </button>
          )}
        </div>
        <span className="map-watermark">SEONGNAM · FAMILY MAP</span>
      </div>
    );
  return <LoadedMap {...props} />;
}
function LoadedMap({
  stores,
  selected,
  onSelect,
  onBounds,
  onSearchArea,
  moved,
  position,
  onLocate,
}: Props) {
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ bounds: INITIAL_BOUNDS, level: 5 });
  const index = useMemo(
    () =>
      new Supercluster<{ store: Store }>({ radius: 55, maxZoom: 19 }).load(
        stores.map((s) => ({
          type: "Feature",
          properties: { store: s },
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        })),
      ),
    [stores],
  );
  const points = useMemo(
    () =>
      index.getClusters(
        [
          view.bounds.west,
          view.bounds.south,
          view.bounds.east,
          view.bounds.north,
        ],
        Math.max(0, 19 - view.level),
      ),
    [index, view],
  );
  useEffect(() => {
    if (map && selected)
      map.panTo(new kakao.maps.LatLng(selected.lat, selected.lng));
  }, [map, selected]);
  useEffect(() => {
    if (map && position)
      map.panTo(new kakao.maps.LatLng(position.lat, position.lng));
  }, [map, position]);
  useEffect(() => {
    if (!container.current || !map) return;
    const observer = new ResizeObserver(() => map.relayout());
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [map]);
  const [group, setGroup] = useState<Store[]>([]);
  function report(target: kakao.maps.Map) {
    const b = target.getBounds(),
      sw = b.getSouthWest(),
      ne = b.getNorthEast(),
      c = target.getCenter();
    const bounds = {
      south: sw.getLat(),
      west: sw.getLng(),
      north: ne.getLat(),
      east: ne.getLng(),
    };
    setView({ bounds, level: target.getLevel() });
    onBounds(bounds, { lat: c.getLat(), lng: c.getLng() });
  }
  return (
    <div className="map-canvas" ref={container}>
      <KakaoCanvas
        center={CITY_CENTER}
        level={5}
        style={{ width: "100%", height: "100%" }}
        onCreate={(m) => {
          setMap(m);
          report(m);
        }}
        onIdle={report}
        onClick={() => setGroup([])}
      >
        {points.map((p) => {
          const [lng, lat] = p.geometry.coordinates;
          const cluster = "cluster" in p.properties && p.properties.cluster;
          return (
            <CustomOverlayMap
              key={cluster ? `c${p.id}` : p.properties.store.id}
              position={{ lat, lng }}
              clickable
            >
              <button
                className={`map-pin ${cluster ? "cluster" : ""}`}
                aria-label={
                  cluster
                    ? `${"point_count" in p.properties ? p.properties.point_count : 1}개 가맹점 보기`
                    : p.properties.store.name
                }
                onClick={() => {
                  if (cluster) {
                    const leaves = index
                      .getLeaves(Number(p.id), Infinity)
                      .map((f) => f.properties.store);
                    const same = leaves.every(
                      (s) => s.lat === leaves[0].lat && s.lng === leaves[0].lng,
                    );
                    if (same || view.level <= 1) setGroup(leaves);
                    else {
                      map?.setLevel(
                        Math.max(
                          1,
                          19 - index.getClusterExpansionZoom(Number(p.id)),
                        ),
                      );
                      map?.panTo(new kakao.maps.LatLng(lat, lng));
                    }
                  } else onSelect(p.properties.store);
                }}
              >
                {cluster ? (
                  "point_count" in p.properties ? (
                    p.properties.point_count
                  ) : (
                    1
                  )
                ) : (
                  <>
                    <span>●</span>
                    {p.properties.store.name}
                  </>
                )}
              </button>
            </CustomOverlayMap>
          );
        })}
        {position && <MapMarker position={position} />}
        {selected && (
          <CustomOverlayMap position={selected} yAnchor={1.7} zIndex={10}>
            <div className="selected-marker">{selected.name}</div>
          </CustomOverlayMap>
        )}
      </KakaoCanvas>
      {moved && (
        <button className="area-search" onClick={onSearchArea}>
          <RefreshCw size={16} /> 이 지역에서 검색
        </button>
      )}
      <button
        className="locate-map"
        aria-label="현재 위치로 이동"
        onClick={onLocate}
      >
        <Crosshair size={21} />
      </button>
      {group.length > 0 && (
        <div className="group-popup">
          <div className="row between">
            <strong>같은 위치의 가맹점 {group.length}곳</strong>
            <button
              className="icon-button"
              onClick={() => setGroup([])}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
          {group.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onSelect(s);
                setGroup([]);
              }}
            >
              {s.name}
              <small>{s.category}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
