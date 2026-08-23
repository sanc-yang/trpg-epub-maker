export default function PageHeader({ title, desc, t }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{
        fontSize: '1.4em', fontWeight: 800, margin: 0,
        letterSpacing: '-0.02em', color: t.text, lineHeight: 1.25,
      }}>{title}</h1>
      {desc && (
        <p style={{ fontSize: '0.82em', color: t.textSub, margin: '6px 0 0' }}>{desc}</p>
      )}
    </div>
  )
}
