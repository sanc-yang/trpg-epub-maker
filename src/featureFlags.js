/**
 * 기능 노출 플래그. 삭제 대신 여기서 끄는 이유 = 되살릴 판단이 남아 있는 기능이라
 * 코드 경로를 유지해 두는 것.
 */

// 다크모드 토글 버튼. 필요성 낮아 숨김. 테마 코드 자체는 살아 있음.
export const SHOW_THEME_TOGGLE = false

// playground 메뉴. 준비 전이라 숨김.
export const SHOW_PLAYGROUND = false

// 코코포리아 「URL 로 가져오기」.
// 코코포리아 정책상 외부에서 Firestore 직접 조회가 불가하여 숨김. HTML 업로드만 지원.
// 정책이 바뀌면 true 로 되돌리면 됨 (fetchCcfoliaLog / extractRoomId 는 그대로 남겨둠).
export const SHOW_CCFOLIA_URL_MODE = false
