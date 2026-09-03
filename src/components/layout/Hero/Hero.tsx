import { useCompressor } from "../../../stores/CompressorContext"
import "./Hero.css"

export function Hero() {
  const { level } = useCompressor()
  const val = level.kind === "auto" ? "Auto" : level.kind === "percent" ? `${level.percent}%` : level.customKB >= 1024 ? `${+(level.customKB / 1024).toFixed(1)} MB` : `${level.customKB} KB`
  return (
    <div className="wrap hero">
      <div className="eyebrow">Private — files never leave your device</div>
      <h1>Every file,<br /><i>smaller</i> <span className="val">{val}</span>.</h1>
      <p>Drag images, GIFs & PDFs — even hundreds of MB. Pick <b style={{ color: "var(--ink)" }}>Auto, 25%, 50%, 100% or an exact size</b> right in your browser. Honest precise, no fake padding. Smaller files are kept as-is.</p>
    </div>
  )
}
