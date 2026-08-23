import { CheckCircle, AlertCircle } from 'lucide-react'

export default function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 9999 }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {toasts.map(({ id, message, type }) => (
        <div key={id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: type === 'error' ? 'rgba(30,10,10,0.88)' : 'rgba(10,20,10,0.88)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          color: '#fff', borderRadius: 12, padding: '11px 18px',
          fontSize: '0.85em', fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          border: `1px solid ${type === 'error' ? 'rgba(255,80,80,0.3)' : 'rgba(80,220,120,0.3)'}`,
          animation: 'fadeUp 0.25s ease',
          maxWidth: 320,
        }}>
          {type === 'error'
            ? <AlertCircle size={16} color="#ff6b6b" style={{ flexShrink: 0 }} />
            : <CheckCircle size={16} color="#6bffaa" style={{ flexShrink: 0 }} />}
          {message}
        </div>
      ))}
    </div>
  )
}
