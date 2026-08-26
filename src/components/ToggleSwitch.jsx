export default function ToggleSwitch({ checked, onChange, label, labelColor, offColor }) {
  return (
    <label onClick={() => onChange(!checked)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: '0.84em', color: labelColor || '#555', whiteSpace: 'nowrap' }}>
      <div style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? '#3b82f6' : (offColor || '#ccc'),
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2, left: checked ? 18 : 2,
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {label}
    </label>
  )
}
