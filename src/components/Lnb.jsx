import { useState } from 'react'
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react'
import { glass } from '../theme'
import { NAV_GROUPS } from '../navConfig'

const LOGO = (
  <svg width="26" height="26" viewBox="0 0 48 48" style={{ flexShrink: 0, display: 'block' }}>
    <rect x="8" y="6" width="32" height="36" rx="4.5" fill="currentColor" />
    <rect x="13" y="6" width="1.6" height="36" fill="#fff" />
    <path d="M27.3 15.8 34.401 19.9v8.2L27.3 32.2 20.199 28.1v-8.2z" fill="#fff" />
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
      <path d="M27.3 18.67 32.286 27.485H22.314z" />
      <path d="M27.3 18.67V15.8" />
      <path d="M32.286 27.485 34.401 28.1" />
      <path d="M22.314 27.485 20.199 28.1" />
    </g>
  </svg>
)

function NavItem({ item, active, collapsed, onSelect, t }) {
  const { key, label, Icon, soon } = item
  const on = active === key
  const disabled = !!soon
  const [hover, setHover] = useState(false)

  return (
    <button
      type="button"
      // 접힘 상태에서 브라우저 기본 툴팁으로 메뉴명 노출
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={on ? 'page' : undefined}
      onClick={() => !disabled && onSelect(key)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: collapsed ? '10px 0' : '9px 11px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 9, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: on ? t.accent : (hover && !disabled ? t.hover : 'transparent'),
        color: on ? t.accentFg : disabled ? t.textMuted : t.text,
        fontWeight: on ? 600 : 400, fontSize: '0.84em', fontFamily: 'inherit',
        whiteSpace: 'nowrap', textAlign: 'left', transition: 'background 0.12s',
      }}
    >
      <Icon size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
      {!collapsed && soon && (
        <span style={{
          marginLeft: 'auto', fontSize: '0.72em', border: `1px solid ${t.borderSub}`,
          borderRadius: 4, padding: '1px 5px', color: t.textMuted,
        }}>준비중</span>
      )}
    </button>
  )
}

/**
 * 좌측 내비게이션.
 * 데스크톱 = 접기/펼치기 사이드바(접힘 시 아이콘 + title 툴팁)
 * 모바일   = 상단바 햄버거 → 오버레이 드로어(항상 펼침 형태)
 */
export default function Lnb({ page, onSelect, collapsed, onToggleCollapse, isMobile, drawerOpen, onCloseDrawer, t }) {
  const showCollapsed = collapsed && !isMobile

  const body = (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: showCollapsed ? 0 : '0 6px', marginBottom: 18, minHeight: 30,
        justifyContent: showCollapsed ? 'center' : 'flex-start', color: t.text,
      }}>
        {LOGO}
        {!showCollapsed && (
          <span style={{ fontSize: '0.86em', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
            TRPG 세션<br />제본소
          </span>
        )}
      </div>

      {NAV_GROUPS.filter(g => !g.hidden).map(g => (
        <div key={g.label} style={{ marginBottom: 14, width: '100%' }}>
          {showCollapsed
            ? <div style={{ height: 1, background: t.borderSub, margin: '6px 8px 8px' }} />
            : <div style={{
                fontSize: '0.62em', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
                color: t.textMuted, padding: '0 11px', marginBottom: 6, whiteSpace: 'nowrap',
              }}>{g.label}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {g.items.map(item => (
              <NavItem key={item.key} item={item} active={page} collapsed={showCollapsed}
                onSelect={(k) => { onSelect(k); onCloseDrawer?.() }} t={t} />
            ))}
          </div>
        </div>
      ))}
    </>
  )

  // ─── 모바일: 상단바 + 드로어 ───
  if (isMobile) {
    return (
      <>
        {drawerOpen && (
          <>
            <div onClick={onCloseDrawer} style={{
              position: 'fixed', inset: 0, background: 'rgba(30,20,50,0.30)', zIndex: 40,
            }} />
            <aside style={{
              position: 'fixed', top: 0, bottom: 0, left: 0, width: 254, zIndex: 50,
              padding: '18px 14px', display: 'flex', flexDirection: 'column',
              background: t.drawerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              borderRight: `1px solid ${t.borderSub}`, overflowY: 'auto',
            }}>
              <button type="button" onClick={onCloseDrawer} aria-label="닫기" style={{
                position: 'absolute', top: 14, right: 12, background: 'none', border: 'none',
                color: t.textSub, cursor: 'pointer', padding: 4, lineHeight: 0,
              }}><X size={17} /></button>
              {body}
            </aside>
          </>
        )}
      </>
    )
  }

  // ─── 데스크톱: 사이드바 ───
  return (
    <aside style={{
      width: showCollapsed ? 64 : 226, flexShrink: 0,
      padding: showCollapsed ? '20px 10px' : '20px 14px',
      display: 'flex', flexDirection: 'column',
      alignItems: showCollapsed ? 'center' : 'stretch',
      borderRight: `1px solid ${t.borderSub}`,
      transition: 'width 0.18s ease', position: 'sticky', top: 0, alignSelf: 'flex-start',
      height: '100svh', boxSizing: 'border-box',
    }}>
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={showCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
        title={showCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
        style={{
          position: 'absolute', top: 22, right: -12, width: 24, height: 24, borderRadius: '50%',
          ...glass(t), background: t.isDark ? '#22202e' : '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: t.textSub, cursor: 'pointer', zIndex: 10, padding: 0,
          boxShadow: '0 1px 5px rgba(80,60,140,0.16)',
        }}
      >
        {showCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>
      {body}
    </aside>
  )
}

/** 모바일 상단바 — 햄버거 + 서비스명 */
export function MobileTopBar({ onOpenDrawer, t }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '11px 14px', borderBottom: `1px solid ${t.borderSub}`,
      ...glass(t), position: 'sticky', top: 0, zIndex: 30,
    }}>
      <button type="button" onClick={onOpenDrawer} aria-label="메뉴 열기" style={{
        width: 32, height: 32, borderRadius: 9, border: `1px solid ${t.border}`,
        background: t.surface, color: t.text, display: 'flex', alignItems: 'center',
        justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0,
      }}><Menu size={17} /></button>
      <span style={{ fontSize: '0.9em', fontWeight: 800, letterSpacing: '-0.02em', color: t.text }}>
        TRPG 세션 제본소
      </span>
    </div>
  )
}
