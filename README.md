# 성남 아동수당 지도

성남시 아동수당 사용처를 지도·목록에서 찾는 모바일 웹 서비스입니다. 회원가입 없이 이름·주소 검색, 지역·업종 필터, 음식점 탐색, 길찾기, 공유, 기기 내 즐겨찾기를 제공합니다.

## 개발

Node.js 22, pnpm 10.28.2를 사용합니다.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm exec tsx scripts/setup-admin.ts
pnpm dev
```

기존 `.env.local`이 있으면 복사로 덮어쓰지 말고 필요한 설정만 추가하세요. `NEXT_PUBLIC_KAKAO_API_KEY`가 없어도 검색·목록·길찾기를 사용할 수 있습니다. 지도는 로딩 실패 안내를 표시합니다.

```bash
pnpm typecheck
pnpm lint
pnpm test
NEXT_PUBLIC_KAKAO_API_KEY=e2e-placeholder pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

브라우저 테스트는 SDK 모의 응답으로 지도 초기화·검색·선택을 검증하며, SDK 실패 대응과 관리자 접근 제어도 검사합니다. 위 빌드 명령의 placeholder는 테스트 전용입니다. 실제 배포는 본인 JavaScript 키를 설정하고 `pnpm build`를 사용합니다. 테스트는 고정된 로컬 테스트용 관리자 비밀값을 주입합니다. 운영에는 `setup-admin.ts`로 생성한 별도 난수를 사용하세요.

## 데이터

`data/catalog.json`이 승인된 단일 원본입니다. 빌드 시 `public/data/manifest.json`과 내용 해시가 포함된 JSON 파일을 생성합니다. 공개 데이터는 JavaScript 번들에 포함되지 않습니다.

`음식점 찾기`는 신한카드 업종으로 음식 종류를 분류합니다. 행정안전부 [성남시 착한가격업소 공개 목록](https://www.goodprice.go.kr/bssh/bsshList.do?srchCtpvCd=41&srchSggCd=41130)의 대표 메뉴·가격은 상호와 도로명 주소가 모두 일치한 가맹점에만 표시합니다. `data/restaurant-facts.json`은 독립된 출처 스냅샷이며 `pnpm data:restaurants`로 갱신합니다. 현재 목록 66곳 중 기존 가맹점과 확실히 연결된 5곳에만 적용됩니다. 가격은 대표 메뉴의 공개 가격으로, 음식점의 평균 가격이나 모든 메뉴의 가격을 뜻하지 않습니다. 가격 정보가 없는 곳은 가격 필터에서 제외됩니다. 평점은 신한카드·카카오 공개 API에 없어 표시하지 않으며 각 가게의 카카오맵 메뉴·후기 검색으로 연결합니다.

음식점 상세를 열면 NAVER API HUB 지역 검색과 카카오 장소 검색을 호출합니다. 검색 결과는 가맹점 데이터와 합치거나 저장하지 않고 출처별로 구분합니다. 카카오의 같은 주소 검색 결과라도 상호가 다르면 동일 가게로 단정하지 않습니다. 이 API들은 평점·메뉴 가격을 제공하지 않습니다. 서버 전용 `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`, `KAKAO_REST_API_KEY`가 없으면 해당 실시간 조회만 생략합니다.

초기 데이터는 원본 저장소의 공개 자료를 변환했습니다. 확인되지 않은 수집·승인 날짜는 `null`로 보존하고 화면에서 이전 자료임을 알립니다. 원본 10,399건 중 이름·주소 정규화 후 중복 1건을 정리해 10,398건으로 시작합니다. 근거는 `data/migration-report.json`에 기록했습니다.

### 수집과 검토

- 매일 06:17 KST에 GitHub Actions가 신한카드 공개 조회 API의 전체 지역·업종·페이지를 조회합니다. GitHub 예약 실행은 지연될 수 있습니다.
- 지역별 최대 3개 작업을 병행합니다. 원본 조회 실패, 페이지 반복, 누락 또는 비정상 감소 시 후보를 게시하지 않습니다.
- 같은 주소는 기존 좌표를 재사용합니다. 신규 주소는 GitHub secret의 `KAKAO_REST_API_KEY`로 변환합니다.
- 검증 통과 후보는 `codex/data-*` 브랜치와 PR에 저장합니다. 관리자 승인 전에는 `main`을 변경하지 않습니다.
- 수집 결과와 실패 항목은 Actions artifact로 30일간 보관합니다. 동일한 공개·대기·거절 버전은 중복 게시하지 않습니다.
- 자동 수집 활성화에는 repository variable `COLLECTION_ENABLED=true`가 필요합니다. 외부 설정을 완료하기 전에는 예약 작업을 실행하지 않습니다.

```bash
# 로컬 실행은 환경변수를 명시적으로 주입하거나 Node의 env-file 기능을 사용합니다.
node --env-file=.env.local --import tsx scripts/collect.ts
# 실제 API 한 구간만 확인. 불완전 수집으로 판정해 종료 코드 1을 반환하며 게시 불가합니다.
pnpm exec tsx scripts/collect.ts --smoke
```

## 관리자

별도 레이아웃의 `/<비밀값>/enter` 링크로 접근합니다. 일반 사이트에서 연결하지 않습니다. 비밀 링크가 접근 자격이며, 서버에서 4시간 유효한 서명 쿠키를 발급합니다. 조회·승인·거절·복구 API 모두 세션 검증을 거칩니다. Preview의 변경 요청은 차단합니다.

관리자는 데이터 파일만 변경한 내부 PR을 승인할 수 있습니다. 검토한 커밋과 현재 후보·공개 버전을 확인하고, 작업 잠금으로 동시 승인·복구를 직렬화합니다. 복구는 이전 데이터를 새 커밋으로 기록하며 강제 푸시하지 않습니다. 승인 후 배포된 버전을 조회해 ‘승인’과 ‘반영’을 구분합니다.

환경변수, Vercel/GitHub 연결, 복구 절차는 [운영 가이드](docs/operations.md)를 참고하세요.

## 기술 구성

Next.js 15 App Router · React 19 · TypeScript · styled-components · Kakao Maps · Supercluster · GitHub Actions · Vercel

- `src/lib`: 검색, 데이터 검증, 수집 응답 파싱, 관리자 인증·GitHub 작업
- `src/components`: 사용자 탐색 화면, 지도, 독립 관리자 화면
- `scripts`: 공개 데이터 생성, 원본 수집, 검토 후보 게시
- `scripts/enrich-restaurants.ts`: 착한가격업소 공개 목록 조회와 상호·주소 일치 검증
- `tests`, `e2e`: 검색 정확성·관리자 보안·배포용 빌드의 브라우저 검증

## 출처

원작: [gomjellie/sungnam-child-allowance-map](https://github.com/gomjellie/sungnam-child-allowance-map), 기반 커밋 `1491b015586b7126aa835306a62ff305031c06a7`.
가맹점 정보: [신한카드 성남시 아동수당 사용처 조회](https://www.shinhancard.com/mob/MOBFM204N/MOBFM204R11.shc).
음식점 대표 메뉴·가격: [행정안전부 착한가격업소 공개 목록](https://www.goodprice.go.kr/bssh/bsshList.do?srchCtpvCd=41&srchSggCd=41130).

성남시·신한카드 공식 서비스가 아닙니다. 실제 사용 가능 여부는 원본과 가맹점에서 확인하세요. 원작자 API 키는 현재 소스에서 제거했으며 사용하지 않습니다. 이전 Git 이력은 보존되어 있습니다.
