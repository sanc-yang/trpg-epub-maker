# 남은 작업 목록

## 배포 (1순위)

| 작업 | 비고 |
|---|---|
| **집 PC 에서 push + 재배포** | 회사 PC 에서 push 불가 → 패치 전송 방식. 절차는 개인 볼트 노트 §2 |
| **GitHub Actions 배포 워크플로** | 등록하면 이후 push 만으로 자동 배포. 워크플로 파일 자체는 최초 1회 push 필요 |
| `og:image` 실물 확인 | 사내 프록시로 `sanc-yang.github.io` 접속 차단. 집에서 OG 디버거로 확인 |
| `LICENSE` 추가 | 공개 저장소인데 미지정. MIT 권장 |

## 확인 필요

- **Pretendard 웹폰트 육안 확인** — jsDelivr CDN 이 막힌 환경에서는 폴백으로 떨어짐. 집에서 실제 적용 여부 확인
- **`docs/` 개발계획서 갱신** — 계획서는 Tailwind + `epub-gen-memory` 전제이나 실제는 인라인 스타일 + JSZip 직접 구성. 코드가 정답

## 기능 후보

| 작업 | 비고 |
|---|---|
| playground | LNB 에 자리만 잡아둠. `featureFlags.SHOW_PLAYGROUND = true` 로 노출 |
| 미리보기 패널 높이 자동 조절 | 600px 고정. 과거에 시도했다 되돌린 이력 있음 |
| 표지 템플릿 추가 | 현재 3종(사진+하단 / 미니멀 / 프레임). `utils/coverCanvas.js` 의 `COVER_TEMPLATES` 에 추가 |

## 보류 — 코코포리아 URL 수집

정책상 외부에서 Firestore 직접 조회가 불가해 **UI 에서 숨김**(`featureFlags.SHOW_CCFOLIA_URL_MODE = false`).
`fetchCcfoliaLog` / `extractRoomId` / 방 ID 유효성 검사는 코드에 남겨둠 — 정책이 바뀌면 플래그만 되돌리면 됨.

---

## 완료

### 2026-08-21 — 배포 준비 + LNB 개편
- [x] README 전면 재작성 (기존엔 Vite 템플릿 기본 문구)
- [x] `index.html` 메타 정비 — lang/description/canonical/theme-color/OG/Twitter
- [x] 파비콘 교체 — 기존 파일이 타 서비스 로고였음. 주사위(d20) 표지의 책, 모노톤 플랫 + 다크 자동 반전
- [x] OG 이미지 신규 — 배경을 앱 라이트 테마 그라디언트와 동일 값으로
- [x] 미사용 제거 — `epub-gen-memory`, 템플릿 잔재 자산 4건, 죽은 `index.css` 토큰
- [x] lint error 5 + warning 4 해소 → 0건 유지
- [x] `[무공비급]` 제거, 명조 → 고딕 전환
- [x] 다크모드 토글 숨김 (플래그)
- [x] **모바일 반응형** — 표지 편집/생성 세로 배치, 모드 버튼 1열, 루트 폰트 스케일
- [x] **`App.jsx` 컴포넌트 분리** — 960줄 단일 파일 → `components/` + `pages/` + `theme/hooks/featureFlags/navConfig`
- [x] **LNB 신설** — collapsible(접힘 시 아이콘+툴팁), 모바일 드로어
- [x] **표지 생성기** — 템플릿 3종, 이미지 드래그·확대, 텍스트 얹기, 진입 시 목적 선택
- [x] **EPUB 본문 서체 선택** — 고딕 / 명조
- [x] 드롭존 공용 컴포넌트화 (3곳 스타일 통일)
- [x] 용어 정리 — 「메타데이터」 → 「책 정보」, 안내문의 「로그」 → 「eBook」

### 이전
- [x] 플랫폼 탭 기억 (localStorage `trpg_source`)
- [x] 코코포리아 방 ID·URL 유효성 검사 (URL 모드 숨김으로 현재 비노출)
- [x] lucide-react 아이콘 적용
- [x] 글래스모피즘 UI (라이트/다크)
- [x] 파싱 중 스피너 / 모드 선택 후 자동 스크롤
- [x] iOS Safari 배경 버그 수정
- [x] alert → 글래스 토스트 알림
