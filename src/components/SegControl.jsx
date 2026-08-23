/** 세그먼트 컨트롤. options = [[value, label], ...] */
export default function SegControl({ value, onChange, options, t, size = 'sm' }) {
  const pad = size === 'md' ? '8px 0' : '4px 11px'
  const fs = size === 'md' ? '0.82em' : '0.78em'
  return (
    <div style={{
      display: 'flex', border: `1px solid ${t.inputBorder}`, borderRadius: size === 'md' ? 8 : 7,
      overflow: 'hidden', flexShrink: 0, width: size === 'md' ? '100%' : undefined,
    }}>
      {options.map(([key, label], i) => (
        <button key={key} type="button" onClick={() => onChange(key)} style={{
          flex: size === 'md' ? 1 : undefined,
          background: value === key ? t.accent : t.inputBg,
          color: value === key ? t.accentFg : t.textSub,
          fontWeight: value === key ? 600 : 400,
          border: 'none', borderLeft: i === 0 ? 'none' : `1px solid ${t.inputBorder}`,
          padding: pad, fontSize: fs, cursor: 'pointer', fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </button>
      ))}
    </div>
  )
}
