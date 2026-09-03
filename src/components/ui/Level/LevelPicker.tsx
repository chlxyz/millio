import { useEffect, useState } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import { MAX_KB, MIN_KB, targetBytesFor, type Level } from "../../../types/file"
import { fmtBytes } from "../../../lib/format"
import "./LevelPicker.css"

const clampKB = (v: number) => Math.min(MAX_KB, Math.max(MIN_KB, v))
const PRESETS: { label: string; percent: number }[] = [
  { label: "25%", percent: 25 },
  { label: "50%", percent: 50 },
  { label: "100%", percent: 100 },
]

export function LevelPicker({ onConfirm, disabled }: { onConfirm?: (v: Level) => void; disabled?: boolean }) {
  const { items, level, draftLevel, hasLevelPending, setDraftLevel, confirmLevel, requestCompress } = useCompressor()
  const globalCompressing = items.some(i => i.status === "queued" || i.status === "compressing")
  const isCompressing = disabled ?? globalCompressing
  const pendingCount = items.filter(i => i.status === "pending").length
  // home instance (no onConfirm) starts the run; editor instance drives merged bytes via onConfirm
  const canConfirm = !isCompressing && (hasLevelPending || (pendingCount > 0 && !onConfirm))

  const [text, setText] = useState(String(draftLevel.customKB))
  const [unit, setUnit] = useState<"KB" | "MB">("KB")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (isCompressing) return
    setText(unit === "KB" ? String(draftLevel.customKB) : String(+(draftLevel.customKB / 1024).toFixed(1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLevel.customKB, unit === "KB" ? "kb" : "mb"])

  // batch preview for percent levels (per-file %, summed)
  const preview = (() => {
    if (!items.length || draftLevel.kind !== "percent") return ""
    const total = items.reduce((a, it) => a + (targetBytesFor(it.originalSize, draftLevel) ?? it.originalSize), 0)
    return `≈ ${fmtBytes(total)} total for ${items.length} file${items.length !== 1 ? "s" : ""}`
  })()

  const pick = (kind: Level["kind"], percent?: number) => {
    if (isCompressing) return
    setDraftLevel({ ...draftLevel, kind, percent: percent ?? draftLevel.percent })
    setNote("")
  }

  const commitText = () => {
    const v = parseFloat(text)
    if (isNaN(v)) { setText(String(draftLevel.customKB)); return }
    const kb = clampKB(Math.round(unit === "KB" ? v : v * 1024))
    if ((unit === "KB" ? v : v * 1024) !== kb) setNote(`Clamped to ${fmtBytes(kb * 1024)} (min ${MIN_KB} KB, max 500 MB)`)
    setDraftLevel({ ...draftLevel, kind: "custom", customKB: kb })
  }

  const confirm = () => {
    if (!canConfirm) return
    // resolve typed value now so un-blurred typing still counts
    const typed = parseFloat(text)
    const typedKB = isNaN(typed) ? NaN : Math.round(unit === "KB" ? typed : typed * 1024)
    const resolved: Level = draftLevel.kind === "custom" && !isNaN(typedKB)
      ? { ...draftLevel, customKB: clampKB(typedKB) }
      : { ...draftLevel }
    if (!isNaN(typedKB) && resolved.customKB !== typedKB) {
      setNote(`Clamped to ${fmtBytes(resolved.customKB * 1024)} (min ${MIN_KB} KB, max 500 MB)`)
    }
    setDraftLevel(resolved)
    confirmLevel(resolved)
    if (onConfirm) {
      onConfirm(resolved)
      return
    }
    requestCompress()
  }

  return (
    <div className={`slider-wrap ${isCompressing ? "slider-wrap--disabled" : ""}`}>
      <div>
        <div className="label">Compression</div>
        <div className="big level-big">{level.kind === "auto" ? "Auto" : level.kind === "percent" ? `${level.percent}%` : fmtBytes(level.customKB * 1024)}</div>
        {hasLevelPending && !isCompressing && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>→ {draftLevel.kind === "auto" ? "Auto" : draftLevel.kind === "percent" ? `${draftLevel.percent}%` : fmtBytes(draftLevel.customKB * 1024)} pending</div>}
        {pendingCount > 0 && !isCompressing && !onConfirm && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>{pendingCount} file{pendingCount !== 1 ? "s" : ""} waiting for Confirm</div>}
      </div>
      <div className="level-btns" role="group" aria-label="Compression level">
        <button className={`chip ${draftLevel.kind === "auto" ? "chip--on" : ""}`} disabled={isCompressing} onClick={() => pick("auto")} title="Smallest readable per file, automatic">Auto</button>
        {PRESETS.map(p => (
          <button key={p.percent} className={`chip ${draftLevel.kind === "percent" && draftLevel.percent === p.percent ? "chip--on" : ""}`} disabled={isCompressing} onClick={() => pick("percent", p.percent)} title={`Target ${p.percent}% of each file's original size`}>{p.label}</button>
        ))}
        <button className={`chip ${draftLevel.kind === "custom" ? "chip--on" : ""}`} disabled={isCompressing} onClick={() => pick("custom")} title="Type an exact size">Custom</button>
      </div>
      {draftLevel.kind === "custom" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="num" type="number" min={0} step={unit === "KB" ? 10 : 0.1} value={text} disabled={isCompressing}
            onChange={e => { setText(e.target.value); setNote("") }} onBlur={commitText}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} aria-label="Custom target size" />
          <div className="level-btns" role="group" aria-label="Size unit">
            {(["KB", "MB"] as const).map(u => (
              <button key={u} className={`chip chip--sm ${unit === u ? "chip--on" : ""}`} disabled={isCompressing} onClick={() => setUnit(u)}>{u}</button>
            ))}
          </div>
        </div>
      )}
      <button className="btn" disabled={!canConfirm} onClick={confirm} title={canConfirm ? "Start compressing" : "No change"}>Confirm</button>
      <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 240 }}>
        {isCompressing ? "Compressing… locked" : note ? <span>{note}</span>
          : draftLevel.kind === "auto" ? <span>Smallest readable per file. {preview}</span>
          : draftLevel.kind === "percent" ? <span>{draftLevel.percent}% of each original. {preview} Press <b style={{ color: "var(--ink)" }}>Confirm</b>.</span>
          : <span>Exact size per file. Min 1 KB • Max 500 MB. Press <b style={{ color: "var(--ink)" }}>Confirm</b>.</span>}
      </div>
    </div>
  )
}
