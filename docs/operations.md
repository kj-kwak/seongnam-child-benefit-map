# 운영 가이드

## 배포 설정

GitHub 저장소: `kj-kwak/seongnam-child-benefit-map`
Vercel 프로젝트: `seongnam-child-benefit-map`
운영 주소: `https://seongnam-child-benefit-map.vercel.app`

1. GitHub Settings → Applications → Installed GitHub Apps → Vercel → Configure에서 이 저장소 접근을 허용합니다.
2. Vercel 프로젝트 Settings → Git에서 저장소를 연결하고 Production Branch를 `main`으로 지정합니다.
3. 프로젝트의 Node.js 버전은 22.x, 프레임워크는 Next.js를 사용합니다. 빌드·설치 명령은 `vercel.json`에 있습니다.
4. 아래 환경변수를 넣고 Preview를 검사한 뒤 운영 배포합니다. 개발·Preview·운영에 등록한 카카오 키 도메인을 각각 확인합니다.

| 변수 | 위치 | 용도 |
|---|---|---|
| NEXT_PUBLIC_KAKAO_API_KEY | Vercel Production/Preview, 로컬 | 본인 카카오 앱의 지도 JavaScript 키 |
| NEXT_PUBLIC_SITE_URL | Vercel Production | 운영 주소, Origin 검증·메타데이터 |
| ADMIN_ENTRY_SECRET | Vercel Production, 로컬 | 32바이트 난수의 64자리 hex 비밀 경로 |
| ADMIN_SESSION_SECRET | Vercel Production, 로컬 | 별도 난수의 세션 서명 키 |
| GITHUB_REPOSITORY | Vercel Production | kj-kwak/seongnam-child-benefit-map |
| GITHUB_ADMIN_TOKEN | Vercel Production | 해당 저장소로 제한한 fine-grained 토큰 |
| KAKAO_REST_API_KEY | GitHub Actions secret, 로컬 수집 시 | 주소 좌표 변환용 본인 REST 키 |
| COLLECTION_ENABLED | GitHub Actions repository variable | 설정 완료 후 true로 변경하여 매일 수집 활성화 |

GitHub 관리자 토큰은 Contents·Pull requests 읽기/쓰기, Actions 읽기 권한만 부여합니다. 개인 CLI의 광범위한 토큰을 복사하지 않습니다. 브라우저에 전달하지 않으며 Preview에는 설정하지 않습니다. 토큰 만료 전에 교체합니다.

수집 workflow가 PR을 생성할 수 있도록 GitHub Actions General → Workflow permissions의 ‘Allow GitHub Actions to create and approve pull requests’를 활성화해야 합니다. 생성된 PR은 자동 병합하지 않습니다. 자동 생성 PR의 추가 CI가 승인 대기할 수 있으므로 수집 workflow 자체에서 전체 데이터 검증을 수행하고 관리자 API도 승인 전 재검증합니다.

카카오 개발자 앱에 실제 운영 주소, localhost 개발 주소, 지도 검증에 사용할 고정 Preview 주소를 허용 도메인으로 등록합니다. 매번 달라지는 Preview URL은 자동으로 허용되지 않습니다. 원작자의 키와 도메인 설정은 승계되지 않습니다.

## 공개 전 확인

- 앱에 본인 JavaScript 키가 반영되고 실제 지도·위치 이동·마커 선택·군집 확대를 확인했는지
- 전체 93개 지역/업종 구간 수집을 마치고 추가·삭제·좌표 실패 내역을 검토했는지
- 관리자 비밀 링크가 공개 메뉴·사이트맵·공개 번들에 없는지
- 승인 → main 반영 → Vercel 배포 → 관리자 ‘반영 완료’까지 연결되는지
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`가 통과하는지

키가 없거나 새 수집을 승인하지 않은 상태는 확인용 배포입니다. 기존 자료의 수집일을 임의로 오늘로 바꾸지 않습니다.

## 관리자 접속과 키 교체

`pnpm exec tsx scripts/setup-admin.ts`는 `.env.local`의 기존 설정을 보존하며 관리자 난수만 추가합니다. 비밀 링크를 `artifacts/admin-access.txt`에 저장합니다. 이 파일과 `.env.local`은 Git에서 제외합니다.

비밀 링크는 관리자 자격 증명입니다. 공개 이슈·PR·채팅·스크린샷에 넣지 마세요. 유출 시 `ADMIN_ENTRY_SECRET`과 `ADMIN_SESSION_SECRET`을 함께 새 값으로 교체하고 재배포합니다. 기존 세션은 무효가 됩니다. 접근 경로 자체는 호스팅 제공자의 요청 로그에 남을 수 있으므로 계정 접근 권한도 제한합니다.

## 변경 승인과 장애 대응

- **수집 실패:** 현재 공개 데이터는 유지됩니다. Actions의 최근 실행과 collection artifact를 확인합니다. 재실행은 GitHub Actions의 Run workflow에서 수행합니다.
- **좌표 변환 실패:** 관리자 화면에서 실패한 가맹점 이름·주소·사유를 확인합니다. API 오류는 수집 검증 실패로 처리합니다. 정상 응답에 주소 결과가 없는 항목은 공개 후보에서 제외하고 실패 목록에 보관합니다.
- **검토 중 후보 변경:** 승인은 HTTP 409로 중단됩니다. 새로고침 후 변경분을 다시 확인합니다.
- **승인 후 배포 대기:** Vercel 빌드 상태와 Git 연동을 확인합니다. 관리자 ‘반영 완료’는 운영 서버가 반환하는 버전·승인일이 일치할 때만 표시됩니다.
- **데이터 복구:** 관리자 이력의 이전 버전을 선택합니다. 데이터만 새 커밋으로 복구하고 Vercel 재배포를 기다립니다. 최근 15개 데이터 변경 커밋을 제공합니다.
- **작업 잠금 잔류:** 서버가 작업 중 강제 종료되면 `admin-operation-lock` Git 태그가 남을 수 있습니다. 진행 중인 승인·복구 요청과 main의 반영 여부를 먼저 확인한 뒤 `gh api -X DELETE repos/kj-kwak/seongnam-child-benefit-map/git/refs/tags/admin-operation-lock`으로 잠금을 해제합니다. 코드 브랜치나 데이터 이력을 삭제하지 않습니다.
- **수집 중 원본 구조 변경:** 변환 형식·지역·업종 목록·페이지 커서를 검증하며 불완전한 결과를 게시하지 않습니다. 검증을 끄지 말고 원본 조회 방식을 재확인합니다.

방문자 검색어와 위치는 서버로 수집하지 않습니다. 위치·즐겨찾기는 브라우저에서 처리합니다. 운영 초기에 Vercel 빌드·요청 오류와 GitHub 수집 실행 상태를 확인하며, 본인 카카오 앱의 호출량도 확인합니다.
