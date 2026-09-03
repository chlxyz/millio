import { useRef, useState } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import "./DropZone.css"

export function DropZone({ isCompressing }: { isCompressing?: boolean }) {
  const { items, addFiles, clearAll } = useCompressor()
  const busy = isCompressing ?? items.some(i => i.status === "queued" || i.status === "compressing")
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ponytail: fully block adds while a run is active — status-only box, drops ignored
  if (busy && items.length) {
    return (
      <div className="drop drop--compact" style={{ cursor: "default" }} aria-busy="true">
        <div>
          <h3>Compressing…</h3>
          <p>Adding more files is paused until the run finishes</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className={`drop ${dragOver ? "drag" : ""} ${items.length ? "drop--compact" : ""}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          if (busy) return
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
        }}
        onClick={() => !items.length && inputRef.current?.click()}
        style={{ cursor: items.length ? "default" : "pointer" }}
      >
        <div>
          <h3>{dragOver ? "Release to compress" : items.length ? "Add more files" : "Drop images & PDFs & GIFs anywhere"}</h3>
          <p>{items.length ? "JPG • PNG • WEBP • GIF • PDF — multiple files" : "JPG • PNG • WEBP • GIF • PDF  •  multiple files  •  stays on device"}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" onClick={e => { e.stopPropagation(); inputRef.current?.click() }}>Select files</button>
          {items.length > 0 && <button className="btn btn-ghost" onClick={clearAll}>Clear</button>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,image/*,application/pdf,image/gif" multiple hidden onChange={e => { if (!busy && e.target.files) addFiles(e.target.files); e.target.value = "" }} />
    </>
  )
}
