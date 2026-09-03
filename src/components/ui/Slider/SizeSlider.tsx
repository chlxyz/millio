import { useEffect, useState } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import "./Slider.css"

export const MIN_KB = 50
export const MAX_KB = 10240

const clampKB = (v: number) => Math.min(MAX_KB, Math.max(MIN_KB, v))

export function SizeSlider({ onConfirm, disabled }: { onConfirm?: (v: number) => void; disabled?: boolean }) {
  const { items, targetKB, draftKB, hasPending, setTargetKB, setDraftKB, confirmTarget, requestCompress } = useCompressor()
  const globalCompressing = items.some(i => i.status === "queued" || i.status === "compressing")
  // ponytail: edit-page instance passes local job state so background item compression can't lock Confirm or wipe the draft
  const isCompressing = disabled ?? globalCompressing
  const pendingCount = items.filter(i => i.status === "pending").length
  const [text, setText] = useState(String(draftKB))
  const [clampedNote, setClampedNote] = useState("")
  const typedVal = parseInt(text)
  const textDiffers = !isNaN(typedVal) && clampKB(typedVal) !== targetKB
  // home instance (no onConfirm) starts the run; editor instance compresses merged bytes via onConfirm instead
  const canConfirm = !isCompressing && (hasPending || textDiffers || (pendingCount > 0 && !onConfirm))

  useEffect(() => {
    if (!isCompressing) setDraftKB(targetKB)
  }, [targetKB, setDraftKB]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setText(String(draftKB)) }, [draftKB])

  const confirm = () => {
    if (!canConfirm) return
    const typed = parseInt(text)
    const v = clampKB(isNaN(typed) ? draftKB : typed)
    if (!isNaN(typed) && typed !== v) setClampedNote(`Clamped to ${v} KB (min ${MIN_KB}, max ${MAX_KB})`)
    setDraftKB(v)
    if (onConfirm) {
      if (v !== targetKB) { setTargetKB(v); confirmTarget() }
      onConfirm(v)
      return
    }
    if (v !== targetKB) setTargetKB(v)
    // request even without target change when first-timers wait
    if (!isCompressing) requestCompress()
  }

  // draft-only: sliding updates draft, Confirm commits to targetKB.
  const setDraft = (v: number) => {
    if (isNaN(v)) return
    const clamped = clampKB(v)
    setClampedNote(clamped !== v ? `Clamped to ${clamped} KB (min ${MIN_KB}, max ${MAX_KB})` : "")
    setDraftKB(clamped)
  }

  const commitText = () => {
    const v = parseInt(text)
    if (isNaN(v)) { setText(String(draftKB)); setClampedNote(""); return }
    setDraft(v)
  }

  return (
    <div className={`slider-wrap ${isCompressing ? "slider-wrap--disabled" : ""}`}>
      <div>
        <div className="label">Target</div>
        <div className="big">{isCompressing ? targetKB : draftKB}<small>KB</small></div>
        {hasPending && !isCompressing && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>→ {draftKB} KB pending</div>}
        {pendingCount > 0 && !isCompressing && !onConfirm && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>{pendingCount} file{pendingCount !== 1 ? "s" : ""} waiting for Confirm</div>}
      </div>
      <div className="range">
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{MIN_KB}</span>
        <input type="range" min={MIN_KB} max={MAX_KB} step={10} value={clampKB(draftKB)} disabled={isCompressing} aria-disabled={isCompressing} title={isCompressing ? "Compressing — please wait" : undefined} onChange={e => setDraft(parseInt(e.target.value))} />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{MAX_KB}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <input className="num" type="number" min={MIN_KB} max={MAX_KB} step={10} value={text} disabled={isCompressing} aria-disabled={isCompressing} title={isCompressing ? "Compressing — please wait" : undefined}
          onChange={e => { setText(e.target.value); setClampedNote("") }}
          onBlur={commitText} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
        <span style={{ fontSize: 10, color: "var(--muted)" }}>Min {MIN_KB} • Max {MAX_KB}</span>
      </div>
      <button className="btn" disabled={!canConfirm} onClick={confirm} title={canConfirm ? `Compress to ${clampKB(draftKB)} KB` : "No change"}>Confirm</button>
      <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 220 }}>{isCompressing ? "Compressing… slider locked" : clampedNote ? <span>{clampedNote}</span> : canConfirm ? <span>Press <b style={{ color: "var(--ink)" }}>Confirm</b> to compress.</span> : <span>Slide then Confirm. Files already smaller are <b style={{ color: "var(--ink)" }}>kept</b>.</span>}</div>
    </div>
  )
}
