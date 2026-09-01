import { useRef, useState } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import "./DropZone.css"

export function DropZone() {
  const { items, addFiles, clearAll } = useCompressor()
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <div
        className={`drop ${dragOver ? "drag" : ""} ${items.length ? "drop--compact" : ""}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
        }}
        onClick={() => !items.length && inputRef.current?.click()}
        style={{ cursor: items.length ? "default" : "pointer" }}
      >
        <div>
          <h3>{dragOver ? "Release to compress" : items.length ? "Add more files" : "Drop images & PDFs anywhere"}</h3>
          <p>{items.length ? "JPG • PNG • WEBP • PDF — multiple files" : "JPG • PNG • WEBP • PDF  •  multiple files  •  stays on device"}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" onClick={e => { e.stopPropagation(); inputRef.current?.click() }}>Select files</button>
          {items.length > 0 && <button className="btn btn-ghost" onClick={clearAll}>Clear</button>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" multiple hidden onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = "" }} />
    </>
  )
}
