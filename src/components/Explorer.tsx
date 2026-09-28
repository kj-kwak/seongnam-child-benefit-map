"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import styled from "styled-components";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Crosshair,
  Heart,
  MapPin,
  Navigation,
  Search,
  Share2,
  X,
  Copy,
  SlidersHorizontal,
} from "lucide-react";
import {
  CITY_CENTER,
  INITIAL_BOUNDS,
  distance,
  formatDistance,
  searchStores,
} from "@/lib/search";
import {
  DISTRICTS,
  SOURCE_URL,
  type Bounds,
  type Metadata,
  type RestaurantFacts,
  type Store,
} from "@/lib/types";
import { CUISINES, cuisineOf, formatWon, type PriceFilter } from "@/lib/restaurant-search";
import NaverLocalSearch from "./NaverLocalSearch";
import KakaoPlaceInfo from "./KakaoPlaceInfo";
import { placeSearchQuery } from "@/lib/kakao-place";
const KakaoMap = dynamic(() => import("./KakaoMap"), {
  ssr: false,
  loading: () => (
    <div className="map-fallback">
      <p>지도를 준비하고 있어요.</p>
    </div>
  ),
});
const App = styled.main`
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--cream);
  overflow: hidden;
`;
const favoriteKey = "seongnam-favorites-v1";
function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ko-KR") : "확인되지 않음";
}
export default function Explorer() {
  const [stores, setStores] = useState<Store[]>([]),
    [metadata, setMetadata] = useState<Metadata | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(""),
    deferredQuery = useDeferredValue(query),
    [district, setDistrict] = useState(""),
    [category, setCategory] = useState(""),
    [savedOnly, setSavedOnly] = useState(false);
  const [foodMode, setFoodMode] = useState(false),
    [cuisine, setCuisine] = useState(""),
    [priceFilter, setPriceFilter] = useState<PriceFilter>("any"),
    [certifiedOnly, setCertifiedOnly] = useState(false),
    [foodSort, setFoodSort] = useState<"distance" | "menuPrice">("distance"),
    [restaurantFacts, setRestaurantFacts] = useState<RestaurantFacts | null>(null),
    [factsError, setFactsError] = useState(false);
  const [favorites, setFavorites] = useState<Store[]>([]),
    [storageReady, setStorageReady] = useState(false);
  const [selected, setSelected] = useState<Store | null>(null),
    [notice, setNotice] = useState(""),
    [limit, setLimit] = useState(50);
  const [bounds, setBounds] = useState<Bounds | null>(INITIAL_BOUNDS),
    [viewBounds, setViewBounds] = useState(INITIAL_BOUNDS),
    [center, setCenter] = useState(CITY_CENTER),
    [moved, setMoved] = useState(false),
    [position, setPosition] = useState<{ lat: number; lng: number } | null>(
      null,
    );
  const [locating, setLocating] = useState(false),
    [sheetHeight, setSheetHeight] = useState(52);
  const mapInitialized = useRef(false),
    listRef = useRef<HTMLDivElement>(null),
    drag = useRef<{ y: number; height: number; moved: boolean } | null>(null);
  const suppressHandleClick = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    setFactsError(false);
    setRestaurantFacts(null);
    setPriceFilter("any");
    setCertifiedOnly(false);
    setFoodSort("distance");
    fetch("/data/manifest.json", { cache: "no-store", signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const meta: Metadata & { url: string; restaurantFactsUrl?: string } = await r.json();
        if (!/^\/data\/stores-[a-f0-9]+\.json$/.test(meta.url)) throw Error();
        const response = await fetch(meta.url, { signal: abort.signal });
        if (!response.ok) throw Error();
        const data: Store[] = await response.json();
        if (!Array.isArray(data) || data.length !== meta.count) throw Error();
        setStores(data);
        setMetadata(meta);
        if (meta.restaurantFactsUrl && /^\/data\/restaurant-facts-[a-f0-9]+\.json$/.test(meta.restaurantFactsUrl)) {
          void fetch(meta.restaurantFactsUrl, { signal: abort.signal })
            .then(async (response) => {
              if (!response.ok) throw Error();
              const snapshot: RestaurantFacts = await response.json();
              if (!snapshot?.facts || typeof snapshot.facts !== "object" || snapshot.metadata.version !== meta.restaurantFactsUrl?.match(/restaurant-facts-([a-f0-9]+)\.json$/)?.[1]) throw Error();
              setRestaurantFacts(snapshot);
            })
            .catch((cause) => {
              if ((cause as Error).name !== "AbortError") setFactsError(true);
            });
        } else {
          setFactsError(true);
        }
        const id = new URLSearchParams(window.location.search).get("store");
        if (id) {
          const store = data.find((s) => s.id === id);
          if (store) {
            setSelected(store);
            setBounds(null);
          } else setNotice("이 가맹점은 현재 목록에서 확인되지 않아요.");
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(
            "가맹점 정보를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [retry]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(favoriteKey) || "[]");
      if (Array.isArray(saved))
        setFavorites(
          saved.filter(
            (s) =>
              typeof s?.id === "string" &&
              typeof s?.name === "string" &&
              typeof s?.address === "string",
          ),
        );
    } catch {
      setNotice("저장한 가맹점을 읽지 못했어요.");
    }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (storageReady)
      try {
        localStorage.setItem(favoriteKey, JSON.stringify(favorites));
      } catch {
        setNotice("이 브라우저에서는 즐겨찾기를 저장할 수 없어요.");
      }
  }, [favorites, storageReady]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    setLimit(50);
    listRef.current?.scrollTo({ top: 0 });
  }, [deferredQuery, district, category, savedOnly, bounds, foodMode, cuisine, priceFilter, certifiedOnly, foodSort]);
  const favoriteIds = useMemo(
    () => new Set(favorites.map((s) => s.id)),
    [favorites],
  );
  const result = useMemo(
    () =>
      searchStores(stores, {
        query: deferredQuery,
        district,
        category,
        bounds,
        favorites: savedOnly ? favoriteIds : undefined,
        center: position || center,
        food: {
          enabled: foodMode,
          cuisine,
          certifiedOnly,
          price: priceFilter,
          sort: foodSort,
          facts: restaurantFacts?.facts || {},
        },
      }),
    [
      stores,
      deferredQuery,
      district,
      category,
      bounds,
      savedOnly,
      favoriteIds,
      position,
      center,
      foodMode,
      cuisine,
      certifiedOnly,
      priceFilter,
      foodSort,
      restaurantFacts,
    ],
  );
  const missing = useMemo(
    () =>
      savedOnly
        ? favorites.filter((s) => !stores.some((x) => x.id === s.id))
        : [],
    [savedOnly, favorites, stores],
  );
  function toggleFavorite(store: Store) {
    setFavorites((current) =>
      current.some((s) => s.id === store.id)
        ? current.filter((s) => s.id !== store.id)
        : [...current, store],
    );
  }
  function selectStore(store: Store) {
    setSelected(store);
    const url = new URL(window.location.href);
    url.searchParams.set("store", store.id);
    window.history.replaceState(null, "", url);
  }
  function closeStore() {
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("store");
    window.history.replaceState(null, "", url);
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("복사했어요.");
    } catch {
      setNotice("복사하지 못했어요. 주소를 직접 선택해 복사해주세요.");
    }
  }
  async function share(store: Store) {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("store", store.id);
    try {
      if (navigator.share)
        await navigator.share({
          title: store.name,
          text: "성남 아동수당 사용처",
          url: url.href,
        });
      else await copy(url.href);
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setNotice("공유하지 못했어요. 다시 시도해주세요.");
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setNotice("이 브라우저에서는 위치 기능을 사용할 수 없어요.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
        setNotice("현재 위치로 이동했어요. 이 지역에서 검색을 눌러주세요.");
      },
      () => {
        setLocating(false);
        setNotice(
          "위치를 확인할 수 없어요. 지역 필터나 주소 검색을 이용해주세요.",
        );
      },
      { timeout: 8000, maximumAge: 60000 },
    );
  }
  function areaSearch() {
    setBounds(viewBounds);
    setMoved(false);
    setSavedOnly(false);
    setFoodMode(false);
    setCuisine("");
    setPriceFilter("any");
    setCertifiedOnly(false);
    setFoodSort("distance");
  }
  function reset() {
    setQuery("");
    setCategory("");
    setDistrict("");
    setSavedOnly(false);
    setBounds(null);
  }
  return (
    <App>
      <a className="skip-link" href="#results">
        가맹점 목록으로 이동
      </a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="성남 아동수당 지도 홈">
          <span className="brand-icon">
            <MapPin size={25} />
            <Heart size={10} />
          </span>
          <span>
            성남 아동수당 지도<small>우리 아이와 함께, 우리 동네에서</small>
          </span>
        </Link>
        <div className="header-right">
          <span className="live-dot" />
          성남시 사용처 안내
          <span className="header-divider" />
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            신한카드 원본 조회 <ArrowUpRight size={14} />
          </a>
        </div>
      </header>
      <div
        className="explorer"
        style={{ "--sheet-height": `${sheetHeight}dvh` } as React.CSSProperties}
      >
        <section
          className="sidebar"
          style={
            { "--sheet-height": `${sheetHeight}dvh` } as React.CSSProperties
          }
          aria-label="가맹점 검색"
        >
          <button
            className="sheet-handle"
            aria-label="목록 높이 조절"
            onClick={() => {
              if (suppressHandleClick.current) {
                suppressHandleClick.current = false;
                return;
              }
              setSheetHeight((h) => (h > 65 ? 52 : 85));
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                setSheetHeight((h) =>
                  Math.min(
                    85,
                    Math.max(26, h + (e.key === "ArrowUp" ? 10 : -10)),
                  ),
                );
              }
            }}
            onPointerDown={(e) => {
              drag.current = {
                y: e.clientY,
                height: sheetHeight,
                moved: false,
              };
              suppressHandleClick.current = false;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current) {
                if (Math.abs(drag.current.y - e.clientY) > 5)
                  drag.current.moved = true;
                setSheetHeight(
                  Math.max(
                    26,
                    Math.min(
                      85,
                      drag.current.height +
                        ((drag.current.y - e.clientY) / window.innerHeight) *
                          100,
                    ),
                  ),
                );
              }
            }}
            onPointerUp={() => {
              suppressHandleClick.current = !!drag.current?.moved;
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <span />
          </button>
          <div className="search-panel">
            <h1 className="visually-hidden">성남 아동수당 사용처 찾기</h1>
            <div className="search-box">
              <Search size={19} />
              <input
                aria-label="가맹점 이름 또는 주소 검색"
                placeholder="가맹점 이름이나 주소를 검색해요"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setBounds(null);
                }}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="검색어 지우기"
                  onClick={() => {
                    setQuery("");
                    setBounds(null);
                  }}
                >
                  <X size={17} />
                </button>
              )}
            </div>
            <div className="filter-row">
              <label className="select-wrap">
                <MapPin size={15} />
                <select
                  aria-label="지역 선택"
                  value={district}
                  onChange={(e) => {
                    setDistrict(e.target.value);
                    setBounds(null);
                  }}
                >
                  <option value="">성남시 전체</option>
                  {DISTRICTS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
              <button
                className={`save-filter ${savedOnly ? "active" : ""}`}
                aria-pressed={savedOnly}
                onClick={() => {
                  setSavedOnly(!savedOnly);
                  setBounds(null);
                }}
              >
                <Bookmark
                  size={16}
                  fill={savedOnly ? "currentColor" : "none"}
                />{" "}
                저장한 곳 <span>{favorites.length}</span>
              </button>
              <button
                className="icon-button location-sidebar"
                aria-label="현재 위치 찾기"
                disabled={locating}
                onClick={locate}
              >
                <Crosshair size={19} />
              </button>
            </div>
            <div className="discovery-mode" role="group" aria-label="탐색 모드">
              <button className={!foodMode ? "active" : ""} aria-pressed={!foodMode} onClick={() => setFoodMode(false)}>전체 사용처</button>
              <button className={foodMode ? "active" : ""} aria-pressed={foodMode} onClick={() => { setFoodMode(true); setSheetHeight(85); }}>음식점 찾기</button>
            </div>
            {foodMode ? <>
              <div className="category-list" role="group" aria-label="음식 종류 필터">
                <button className={`chip ${!cuisine ? "active" : ""}`} onClick={() => setCuisine("")} aria-pressed={!cuisine}>모든 음식 <span>{result.total.toLocaleString()}</span></button>
                {CUISINES.filter((name) => result.cuisines[name] || cuisine === name).map((name) => (
                  <button key={name} className={`chip ${cuisine === name ? "active" : ""}`} onClick={() => setCuisine(cuisine === name ? "" : name)} aria-pressed={cuisine === name}>{name} <span>{result.cuisines[name] || 0}</span></button>
                ))}
              </div>
              <div className="food-filter-row">
                <label className="food-check"><input type="checkbox" checked={certifiedOnly} disabled={!restaurantFacts} onChange={(e) => setCertifiedOnly(e.target.checked)} /> 착한가격업소 인증</label>
                <label className="food-select">대표 메뉴 가격 <select aria-label="대표 메뉴 가격" value={priceFilter} disabled={!restaurantFacts} onChange={(e) => setPriceFilter(e.target.value as PriceFilter)}>
                  <option value="any">전체</option><option value="known">가격 확인된 곳</option><option value="under10000">1만원 미만</option><option value="10000to20000">1만~2만원 미만</option><option value="over20000">2만원 이상</option>
                </select></label>
              </div>
              <p className="food-info">{restaurantFacts ? `공식 대표 메뉴 가격 ${restaurantFacts.metadata.matchedCount}곳 확인 · 미확인 매장 제외` : factsError ? "추가 정보를 불러오지 못했어요. 음식 종류 검색은 이용할 수 있어요." : "음식점 추가 정보 확인 중"}</p>
            </> : <div className="category-list" aria-label="업종 필터">
              <button
                className={`chip ${!category ? "active" : ""}`}
                onClick={() => setCategory("")}
                aria-pressed={!category}
              >
                전체 <span>{result.total.toLocaleString()}</span>
              </button>
              {Object.entries(result.categories)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <button
                    key={name}
                    className={`chip ${category === name ? "active" : ""}`}
                    onClick={() => setCategory(category === name ? "" : name)}
                    aria-pressed={category === name}
                  >
                    {name} <span>{count}</span>
                  </button>
                ))}
              {category && !result.categories[category] && (
                <button className="chip active" onClick={() => setCategory("")}>
                  {category} 0 <X size={12} />
                </button>
              )}
            </div>}
          </div>
          <div className="result-heading" id="results">
            <div>
              <strong>
                {loading
                  ? "불러오는 중"
                  : `${result.matches.length.toLocaleString()}곳`}
              </strong>
              <span>
                {foodMode ? "조건에 맞는 음식점" : savedOnly
                  ? "저장한 가맹점"
                  : bounds
                    ? "현재 지도 안의 사용처"
                    : "성남 전체에서 찾은 사용처"}
              </span>
            </div>
            {foodMode ? <label className="food-select result-sort">정렬 <select aria-label="음식점 정렬" value={foodSort} onChange={(e) => setFoodSort(e.target.value as "distance" | "menuPrice")}><option value="distance">가까운 순</option><option value="menuPrice">확인된 메뉴 가격순</option></select></label> : <span className="sort-label">
              <SlidersHorizontal size={12} />
              {`${position ? "내 위치" : "지도 중심"} 가까운 순`}
            </span>}
          </div>
          <div className="store-list" ref={listRef} aria-busy={loading}>
            {loading ? (
              <div className="skeleton-list">
                {[1, 2, 3, 4].map((i) => (
                  <div className="skeleton" key={i} />
                ))}
              </div>
            ) : error ? (
              <div className="empty-state">
                <p>{error}</p>
                <button
                  className="primary"
                  onClick={() => setRetry((r) => r + 1)}
                >
                  다시 불러오기
                </button>
              </div>
            ) : (
              <>
                {!result.matches.length && !missing.length && (
                  <div className="empty-state">
                    <Search size={30} />
                    <h2>
                      {savedOnly
                        ? "자주 가는 곳을 저장해보세요"
                        : "조건에 맞는 사용처가 없어요"}
                    </h2>
                    <p>
                      {savedOnly
                        ? "가맹점 옆 책갈피를 누르면 여기에 모아볼 수 있어요."
                        : "검색어나 필터를 바꿔 다시 찾아보세요."}
                    </p>
                    <button className="secondary" onClick={reset}>
                      전체 사용처 보기
                    </button>
                  </div>
                )}
                {result.matches.slice(0, limit).map((store) => (
                  <article
                    className={`store-card ${selected?.id === store.id ? "selected" : ""}`}
                    key={store.id}
                  >
                    <button
                      className="store-main"
                      onClick={() => selectStore(store)}
                    >
                      <span className="category-symbol">
                        <MapPin size={19} />
                      </span>
                      <span className="store-copy">
                        <span className="store-tag">{foodMode ? cuisineOf(store) : store.category}</span>
                        <strong>{store.name}</strong>
                        {restaurantFacts?.facts[store.id] && <span className="restaurant-fact-summary">착한가격업소{restaurantFacts.facts[store.id].representativePrice !== null ? ` · 대표 메뉴 ${formatWon(restaurantFacts.facts[store.id].representativePrice!)}` : ""}</span>}
                        <span className="store-address">
                          {store.address.replace(
                            /^경기(?:도)?\s*성남시\s*/,
                            "",
                          )}
                        </span>
                        <span className="store-distance">
                          <Navigation size={11} />
                          {formatDistance(distance(position || center, store))}
                          <span>·</span>
                          {store.district}
                        </span>
                      </span>
                    </button>
                    <button
                      className={`bookmark-button ${favoriteIds.has(store.id) ? "saved" : ""}`}
                      aria-label={`${store.name} 즐겨찾기 ${favoriteIds.has(store.id) ? "해제" : "저장"}`}
                      aria-pressed={favoriteIds.has(store.id)}
                      onClick={() => toggleFavorite(store)}
                    >
                      <Bookmark
                        size={19}
                        fill={
                          favoriteIds.has(store.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </article>
                ))}
                {limit < result.matches.length && (
                  <button
                    className="load-more secondary"
                    onClick={() => setLimit((n) => n + 50)}
                  >
                    사용처 더 보기 <ChevronDown size={16} />
                  </button>
                )}
                {missing.map((store) => (
                  <article className="missing-store" key={store.id}>
                    <strong>{store.name}</strong>
                    <p>현재 목록에서 확인되지 않음</p>
                    <button
                      className="secondary"
                      onClick={() => toggleFavorite(store)}
                    >
                      즐겨찾기에서 제거
                    </button>
                  </article>
                ))}
              </>
            )}
            <footer className="data-footer">
              <div>
                <Check size={13} /> 데이터 출처 · 신한카드
              </div>
              <p>
                수집일 {date(metadata?.collectedAt || null)}
                <br />
                최종 반영일 {date(metadata?.approvedAt || null)}
              </p>
              {metadata && !metadata.collectedAt && (
                <p className="data-note">
                  이전 공개 자료입니다. 최신 사용 가능 여부는 원본에서
                  확인해주세요.
                </p>
              )}
              <a href={SOURCE_URL} target="_blank" rel="noreferrer">
                방문 전 사용처 확인 <ArrowUpRight size={12} />
              </a>
              {restaurantFacts && <a href={restaurantFacts.metadata.sourceUrl} target="_blank" rel="noreferrer">착한가격업소 정보 · {date(restaurantFacts.metadata.collectedAt)} 확인 <ArrowUpRight size={12} /></a>}
              <span>성남시·신한카드의 공식 서비스가 아닙니다.</span>
            </footer>
          </div>
        </section>
        <section className="map-section" aria-label="가맹점 지도">
          <KakaoMap
            stores={result.matches}
            selected={selected}
            position={position}
            onLocate={locate}
            onSelect={selectStore}
            onSearchArea={areaSearch}
            moved={moved}
            onBounds={(b, c) => {
              setViewBounds(b);
              setCenter(c);
              if (!mapInitialized.current) {
                mapInitialized.current = true;
                if (
                  !new URLSearchParams(window.location.search).has("store") &&
                  !query
                )
                  setBounds(b);
              } else setMoved(true);
            }}
          />
          <div className="map-caption">
            <span className="live-dot" /> 우리 동네, 작은 발견
          </div>
          {selected && (
            <section className="store-detail" aria-label="선택한 가맹점 상세">
              <div className="detail-header row between">
                <span className="store-tag">{selected.category} · {selected.district}</span>
                <button
                  className="icon-button"
                  onClick={closeStore}
                  aria-label="상세 닫기"
                >
                  <X size={20} />
                </button>
              </div>
              <h2>{selected.name}</h2>
              <div className="detail-status"><Check size={15} /> 신한카드 아동수당 사용처 목록</div>
              <div className="detail-keyfacts">
                <div><span>업종</span><strong>{selected.type || selected.category}</strong></div>
                <div><span>{position ? "내 위치에서" : "지도 중심에서"}</span><strong>{formatDistance(distance(position || center, selected))}</strong></div>
                <div><span>자료 수집</span><strong>{date(metadata?.collectedAt || null)}</strong></div>
              </div>
              <div className="detail-address"><MapPin size={17} /><span>{selected.address}</span></div>
              {cuisineOf(selected) && <div className="restaurant-detail-info">
                <div className="detail-section-heading"><strong>음식점 정보</strong><span>{cuisineOf(selected)}</span></div>
                {restaurantFacts?.facts[selected.id] ? <>
                  <span className="detail-certification">착한가격업소 인증</span>
                  {restaurantFacts.facts[selected.id].representativeMenu && <div className="detail-menu"><span>공식 대표 메뉴</span><strong>{restaurantFacts.facts[selected.id].representativeMenu}</strong></div>}
                  {restaurantFacts.facts[selected.id].representativePrice !== null && <div className="detail-menu"><span>공개 가격</span><strong>{formatWon(restaurantFacts.facts[selected.id].representativePrice!)}</strong></div>}
                  <a className="detail-text-link" href={restaurantFacts.facts[selected.id].sourceUrl} target="_blank" rel="noreferrer">공식 목록 · {date(restaurantFacts.metadata.collectedAt)} 확인 <ArrowUpRight size={12} /></a>
                </> : <span>공식 대표 메뉴·가격 정보는 확인되지 않았어요.</span>}
                <a className="detail-text-link" href={`https://map.kakao.com/link/search/${encodeURIComponent(placeSearchQuery(selected))}`} target="_blank" rel="noreferrer">카카오맵에서 &lsquo;{placeSearchQuery(selected)}&rsquo; 검색 <ArrowUpRight size={12} /></a>
              </div>}
              <KakaoPlaceInfo key={selected.id} storeId={selected.id} />
              {cuisineOf(selected) && <NaverLocalSearch key={selected.id} storeId={selected.id} />}
              <div className="detail-source">
                <span>공개 데이터 반영 {date(metadata?.approvedAt || null)}</span>
                <a href={SOURCE_URL} target="_blank" rel="noreferrer">신한카드 원본에서 사용 가능 여부 확인 <ArrowUpRight size={12} /></a>
              </div>
              <div className="detail-footer"><a
                className="primary directions"
                href={`https://map.kakao.com/link/to/${encodeURIComponent(selected.name)},${selected.lat},${selected.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={17} /> 카카오맵 길찾기{" "}
                <ArrowUpRight size={15} />
              </a>
              <div className="detail-actions">
                <button onClick={() => copy(selected.address)}>
                  <Copy size={17} />
                  주소 복사
                </button>
                <button onClick={() => share(selected)}>
                  <Share2 size={17} />
                  공유
                </button>
                <button
                  onClick={() => toggleFavorite(selected)}
                  aria-pressed={favoriteIds.has(selected.id)}
                >
                  <Bookmark
                    size={17}
                    fill={
                      favoriteIds.has(selected.id) ? "currentColor" : "none"
                    }
                  />
                  {favoriteIds.has(selected.id) ? "저장됨" : "저장"}
                </button>
              </div>
              </div>
            </section>
          )}
        </section>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </App>
  );
}
