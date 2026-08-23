export default function Spinner({ size = 14, color = 'currentColor' }) {
  return (
    <>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        width: size, height: size, flexShrink: 0,
        border: '2px solid transparent',
        borderTopColor: color, borderRightColor: color,
        borderRadius: '50%',
        animation: '_spin 0.7s linear infinite',
        display: 'inline-block',
      }} />
    </>
  )
}
