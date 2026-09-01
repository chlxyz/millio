import { useMemo } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import { fmtBytes } from "../../../lib/format"
import { useDownloads } from "../../../features/compression/hooks/useDownloads"
import "./ActionBar.css"

export function ActionBar() {
  const { items, clearAll } = useCompressor()
  const { downloadAll } = useDownloads()

  const sum = useMemo(() => {
    const totalOrig = items.reduce((a, b) => a + b.originalSize, 0)
    const totalOut = items.reduce((a, b) => a + (b.outSize ?? b.originalSize), 0)
    const ready = items.filter(i => i.status === "done" || i.status === "kept").length
    return { totalOrig, totalOut, ready, count: items.length }
  }, [items])

  if (!items.length) return null
  return (
    <div className="bar">
      <div className="sum"><b>{sum.count} files</b> • {sum.ready} ready • {fmtBytes(sum.totalOrig)} → {fmtBytes(sum.totalOut)}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-ghost" onClick={clearAll}>Clear</button>
        <button className="btn" disabled={sum.ready === 0} onClick={downloadAll}>
          {sum.ready === 1 ? "Download file" : `Download All${sum.ready ? ` as ZIP` : ""}`}
        </button>
      </div>
    </div>
  )
}
