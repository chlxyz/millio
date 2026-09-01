// import { useCompressor } from "../../../stores/CompressorContext"
import "./Header.css"

export function Header() {
  // const { targetKB } = useCompressor()
  return (
    <div className="wrap top">
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <b>Millio</b> <span style={{ color: "#C8C8C3" }}></span> <span></span>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {/* <span style={{ display: "none" }}>no upload • nothing stored</span> */}
        <span>no login • nothing stored</span>
      </div>
    </div>
  )
}
