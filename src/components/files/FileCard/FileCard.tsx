import { useCompressor } from "../../../stores/CompressorContext"
import { isGif, isPdf } from "../../../features/compression/lib/file"
import { fmtBytes, pctSaved } from "../../../lib/format"
import { useDownloads } from "../../../features/compression/hooks/useDownloads"
import type { Item } from "../../../types/file"
import "./FileCard.css"

export function FileCard({ item }: { item: Item }) {
  const { setItems } = useCompressor()
  const { downloadOne } = useDownloads()
  const out = item.outSize
  const showKept = item.status === "kept"
  const showDone = item.status === "done"
  const isPending = item.status === "pending"
  const isWorking = item.status === "compressing" || item.status === "queued"
  const kind = item.levelKind ?? "custom"
  const tb = item.targetBytes
  const tag = item.appliedLabel ?? (tb ? `≤ ${fmtBytes(tb)}` : "Auto")
  // custom keeps the aggressive-shrink guard; percent only warns on a true miss; auto never warns
  const aggressive = kind === "custom" && tb !== undefined && item.originalSize > tb && tb < item.originalSize * 0.35
  const degraded = item.belowReadableFloor || (item.quality !== undefined && item.quality <= 0.5) || (item.scale !== undefined && item.scale < 0.8)
  const missed = kind !== "auto" && tb !== undefined && out !== undefined && out > tb
  const showQualityWarn = showDone && out !== undefined && (missed || (aggressive && degraded))

  return (
    <div className="card">
      <div className="thumb">
        {item.thumb ? <img src={item.thumb} alt="" /> : <span style={{ color: "var(--muted)", fontSize: 12 }}>{isPdf(item.file) ? "PDF" : isGif(item.file) ? "GIF" : "Image"}</span>}
        {isPdf(item.file) && <span className="pdf-badge">PDF</span>}
        {isGif(item.file) && <span className="pdf-badge">GIF</span>}
        {isWorking && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.72)", display: "grid", placeItems: "center", fontSize: 12, color: "var(--muted)" }}>{item.progress ?? "queued…"}</div>}
      </div>
      <div className="card-body">
        <div className="name" title={item.file.name}>{item.file.name}</div>
        <div className="meta">
          {showKept ? (
            <><b className="kept">Kept</b> — {fmtBytes(item.originalSize)}{item.keptReason === "already-efficient" ? " — already efficient, compressing would enlarge it" : kind === "auto" ? " already minimal" : tb !== undefined ? <> already ≤ {fmtBytes(tb)}</> : ""}</>
          ) : showDone && out ? (
            <><b>{fmtBytes(item.originalSize)} → {fmtBytes(out)}</b> ({tag}) • −{pctSaved(item.originalSize, out)}%{item.vectorSafe && isPdf(item.file) ? " • text selectable" : ""}</>
          ) : isWorking ? (
            <>{fmtBytes(item.originalSize)} → <span style={{ color: "var(--muted)" }}>compressing…</span></>
          ) : isPending ? (
            <>{fmtBytes(item.originalSize)} • <span style={{ color: "var(--muted)" }}>waiting for Confirm</span></>
          ) : item.status === "error" ? (
            <span style={{ color: "var(--accent)" }}>{item.error}</span>
          ) : (
            <>{fmtBytes(item.originalSize)} • queued</>
          )}
        </div>
        {showQualityWarn && out !== undefined && (
          <div className="note">
            {kind === "custom" && tb !== undefined
              ? <>{fmtBytes(item.originalSize)} → {fmtBytes(tb)} target is a heavy shrink — pixels / text may look soft. Minimum readable is {fmtBytes(out)}.{" "}</>
              : <>Couldn't reach {tag} readably — minimum is {fmtBytes(out)}.{" "}</>}
            <button className="link-btn" onClick={() => setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: "kept" as const, outBlob: p.file, outSize: p.originalSize, kept: true, belowReadableFloor: undefined } : p))}>
              Keep original instead
            </button>
          </div>
        )}
        {isWorking && <div className="progress"><i style={{ width: item.status === "compressing" ? "60%" : "20%" }} /></div>}
        <div className="actions">
          <button className="btn btn-ghost" disabled={!item.outBlob && item.status !== "kept"} onClick={() => downloadOne(item)}>Download</button>
          <button className="link-btn" onClick={() => {
            if (item.thumb?.startsWith("blob:")) URL.revokeObjectURL(item.thumb)
            setItems(prev => prev.filter(p => p.id !== item.id))
          }}>Remove</button>
        </div>
      </div>
    </div>
  )
}
