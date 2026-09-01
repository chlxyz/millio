import { useCompressor } from "../../../stores/CompressorContext"
import "./Slider.css"

export function SizeSlider() {
  const { targetKB, setTargetKB } = useCompressor()
  return (
    <div className="slider-wrap">
      <div>
        <div className="label">Target</div>
        <div className="big">{targetKB}<small>KB</small></div>
      </div>
      <div className="range">
        <span style={{ fontSize: 12, color: "var(--muted)" }}>50</span>
        <input type="range" min={50} max={2000} step={10} value={targetKB} onChange={e => setTargetKB(parseInt(e.target.value))} />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>2000</span>
      </div>
      <input className="num" type="number" min={50} max={2000} step={10} value={targetKB} onChange={e => {
        const v = parseInt(e.target.value); if (!isNaN(v)) setTargetKB(Math.min(2000, Math.max(50, v)))
      }} />
      <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 220 }}>Slide to re-compress. Files already smaller are <b style={{ color: "var(--ink)" }}>kept</b>, not inflated.</div>
    </div>
  )
}
