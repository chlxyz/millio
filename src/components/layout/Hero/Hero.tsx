import { useCompressor } from "../../../stores/CompressorContext"
import "./Hero.css"

export function Hero() {
  const { targetKB } = useCompressor()
  return (
    <div className="wrap hero">
      <div className="eyebrow">Private — files never leave your device</div>
      <h1>Every file,<br /><i>exactly</i> <span className="val">{targetKB} KB</span>.</h1>
      <p>Drag images & PDFs. We shrink each one to <b style={{ color: "var(--ink)" }}>≤ {targetKB} KB</b> right in your browser. Honest precise — within 1.5%, no fake padding. Smaller files are kept as-is.</p>
    </div>
  )
}
