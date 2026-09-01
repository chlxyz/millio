import "./Footer.css"

export function Footer() {
  return (
    <div className="foot">
      <div>© {new Date().getFullYear()} Millio — files never leave your device. Stored in the website's RAM.</div>
      <div style={{ display: "flex", gap: 16 }}>
        <a href="#" onClick={e => e.preventDefault()}>Privacy: 100%</a>
        <span>Honest precise ≤ target, kept if smaller</span>
      </div>
    </div>
  )
}
