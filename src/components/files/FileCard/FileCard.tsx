import { useCompressor } from "../../../stores/CompressorContext"
import { isPdf } from "../../../features/compression/lib/file"
import { fmtBytes, pctSaved } from "../../../lib/format"
import { useDownloads } from "../../../features/compression/hooks/useDownloads"
import type { Item } from "../../../types/file"
import "./FileCard.css"

export function FileCard({ item }: { item: Item }) {
  const { targetKB, setItems } = useCompressor()
  const { downloadOne } = useDownloads()
  const out = item.outSize
  const showKept = item.status === "kept"
  const showDone = item.status === "done"
  const isWorking = item.status === "compressing" || item.status === "queued"

  return (
    <div className="card">
      <div className="thumb">
        {item.thumb ? <img src={item.thumb} alt="" /> : <span style={{ color: "var(--muted)", fontSize: 12 }}>{isPdf(item.file) ? "PDF" : "Image"}</span>}
        {isPdf(item.file) && <span className="pdf-badge">PDF</span>}
        {isWorking && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.72)", display: "grid", placeItems: "center", fontSize: 12, color: "var(--muted)" }}>{item.progress ?? "queued…"}</div>}
      </div>
      <div className="card-body">
        <div className="name" title={item.file.name}>{item.file.name}</div>
        <div className="meta">
          {showKept ? (
            <><b className="kept">Kept</b> — {fmtBytes(item.originalSize)} already ≤ {targetKB} KB</>
          ) : showDone && out ? (
            <><b>{fmtBytes(item.originalSize)} → {fmtBytes(out)}</b> (target {targetKB} KB) • −{pctSaved(item.originalSize, out)}%</>
          ) : isWorking ? (
            <>{fmtBytes(item.originalSize)} → <span style={{ color: "var(--muted)" }}>compressing…</span></>
          ) : item.status === "error" ? (
            <span style={{ color: "var(--accent)" }}>{item.error}</span>
          ) : (
            <>{fmtBytes(item.originalSize)} • queued</>
          )}
        </div>
        {item.status === "done" && out && out > targetKB * 1024 && (
          <div className="note">Can’t reach {targetKB} KB — minimum is {fmtBytes(out)} at lowest quality/scale.</div>
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
