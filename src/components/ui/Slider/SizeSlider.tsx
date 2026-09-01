import { useEffect, useState } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import "./Slider.css"

export function SizeSlider() {
  const { items, targetKB, setTargetKB } = useCompressor()
  const isCompressing = items.some(i => i.status === "queued" || i.status === "compressing")
  const [draftKB, setDraftKB] = useState(targetKB)
  const hasPending = draftKB !== targetKB

  useEffect(() => {
    if (!isCompressing) setDraftKB(targetKB)
  }, [targetKB, isCompressing])

  const confirm = () => {
    if (!hasPending || isCompressing) return
    setTargetKB(draftKB)
  }

  return (
    <div className={`slider-wrap ${isCompressing ? "slider-wrap--disabled" : ""}`}>
      <div>
        <div className="label">Target</div>
        <div className="big">{isCompressing ? targetKB : draftKB}<small>KB</small></div>
        {hasPending && !isCompressing && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>→ {draftKB} KB pending</div>}
      </div>
      <div className="range">
        <span style={{ fontSize: 12, color: "var(--muted)" }}>50</span>
        <input type="range" min={50} max={2000} step={10} value={draftKB} disabled={isCompressing} aria-disabled={isCompressing} title={isCompressing ? "Compressing — please wait" : undefined} onChange={e => setDraftKB(parseInt(e.target.value))} />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>2000</span>
      </div>
      <input className="num" type="number" min={50} max={2000} step={10} value={draftKB} disabled={isCompressing} aria-disabled={isCompressing} title={isCompressing ? "Compressing — please wait" : undefined} onChange={e => {
        const v = parseInt(e.target.value); if (!isNaN(v)) setDraftKB(Math.min(2000, Math.max(50, v)))
      }} />
      <button className="btn" disabled={!hasPending || isCompressing} onClick={confirm} title={hasPending ? `Compress to ${draftKB} KB` : "No change"}>Confirm</button>
      <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 220 }}>{isCompressing ? "Compressing… slider locked" : hasPending ? <span>Press <b style={{ color: "var(--ink)" }}>Confirm</b> to re-compress.</span> : <span>Slide then Confirm. Files already smaller are <b style={{ color: "var(--ink)" }}>kept</b>.</span>}</div>
    </div>
  )
}
