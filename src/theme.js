/**
 * 테마 팔레트 + 공통 스타일 조각.
 * 인라인 스타일 기반이라 팔레트를 객체로 만들어 넘김.
 */

export function makeTheme(isDark) {
  return isDark ? {
    isDark: true,
    bg: 'linear-gradient(135deg, #0f0c1e 0%, #1a0f2e 50%, #0c1a2e 100%)',
    glass: 'rgba(255,255,255,0.06)',
    glassBorder: 'rgba(255,255,255,0.12)',
    surface: 'rgba(255,255,255,0.06)', surfaceAlt: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.12)', borderSub: 'rgba(255,255,255,0.07)',
    text: '#f0f0f5', textSub: '#8e8e99', textMuted: '#55555a',
    accent: '#f0f0f5', accentFg: '#111118',
    inputBg: 'rgba(255,255,255,0.09)', inputBorder: 'rgba(255,255,255,0.18)',
    shadow: '0 4px 28px rgba(0,0,0,0.35)',
    hover: 'rgba(255,255,255,0.08)',
    drawerBg: 'rgba(20,18,31,0.94)',
  } : {
    isDark: false,
    bg: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 50%, #fce7f3 100%)',
    glass: 'rgba(255,255,255,0.50)',
    glassBorder: 'rgba(255,255,255,0.80)',
    surface: 'rgba(255,255,255,0.50)', surfaceAlt: 'rgba(255,255,255,0.50)',
    border: 'rgba(180,180,210,0.45)', borderSub: 'rgba(180,180,210,0.30)',
    text: '#1c1c1e', textSub: '#6c6c70', textMuted: '#aeaeb2',
    accent: '#1c1c1e', accentFg: '#ffffff',
    inputBg: 'rgba(255,255,255,0.50)', inputBorder: 'rgba(180,180,210,0.55)',
    shadow: '0 4px 28px rgba(100,80,160,0.08)',
    hover: 'rgba(255,255,255,0.50)',
    drawerBg: 'rgba(255,255,255,0.92)', // 모바일 드로어는 뒤 콘텐츠를 가려야 해서 투명도 예외
  }
}

export const glass = (t) => ({
  background: t.glass,
  backdropFilter: 'blur(18px) saturate(180%)',
  WebkitBackdropFilter: 'blur(18px) saturate(180%)',
  border: `1px solid ${t.glassBorder}`,
  boxShadow: t.shadow,
})

export const styles = (t) => ({
  input: {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: `1px solid ${t.inputBorder}`, fontSize: '0.88em', boxSizing: 'border-box',
    background: t.inputBg, color: t.text, fontFamily: 'inherit', outline: 'none',
  },
  label: {
    fontSize: '0.7em', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: t.textSub, marginBottom: 6, display: 'block', paddingLeft: 8,
  },
  field: { marginBottom: 14 },
  // hover 색은 --btn-hover-* 커스텀 프로퍼티로 넘기고 실제 :hover는 App.css의
  // .btn-primary/.btn-secondary 클래스가 처리 (버튼 쓰는 곳마다 className도 같이 붙여야 함)
  btnPrimary: {
    background: t.accent, color: t.accentFg, border: 'none',
    borderRadius: 8, padding: '10px 22px', fontSize: '0.9em', fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s',
  },
  btnSecondary: {
    background: t.surface, color: t.text, border: `1px solid ${t.border}`,
    borderRadius: 8, padding: '7px 16px', fontSize: '0.82em', fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s, border-color 0.15s',
    '--btn-hover-bg': t.hover, '--btn-hover-border': t.text,
  },
  sectionLabel: {
    fontSize: '0.7em', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: t.textSub, margin: '0 0 18px',
  },
})
