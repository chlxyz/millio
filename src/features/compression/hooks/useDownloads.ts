import { useCallback } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import { isGif, isPdf } from "../lib/file"
import type { Item } from "../../../types/file"

// ponytail: filenames carry the applied level tag (50%, Auto…), legacy targetKB only as fallback
function tagOf(it: Item, fallbackKB: number): string {
  const raw = it.appliedLabel ?? `≤ ${fallbackKB} KB`
  return raw.replace(/[≤\s]/g, "").replace(".", "p")
}

export function useDownloads() {
  const { items, targetKB, level } = useCompressor()
  const levelTag = level.kind === "auto" ? "auto" : level.kind === "percent" ? `${level.percent}pct` : `${level.customKB}kb`

  const downloadOne = useCallback((it: Item) => {
    const blob = it.outBlob ?? it.file
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const ext = isPdf(it.file) ? ".pdf" : isGif(it.file) ? ".gif" : ".jpg"
    const base = it.file.name.replace(/\.[^.]+$/, "")
    a.href = url; a.download = isPdf(it.file) && !isGif(it.file) ? it.file.name : `${base}__${tagOf(it, targetKB)}${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [targetKB])

  const downloadAll = useCallback(async () => {
    if (!items.length) return
    const ready = items.filter(i => i.outBlob || i.status === "kept")
    if (ready.length === 0) return
    if (ready.length === 1) { downloadOne(ready[0]); return }
    const JSZip = (await import("jszip")).default
    const zip = new JSZip()
    for (const it of ready) {
      const blob = it.outBlob ?? it.file
      const buf = await blob.arrayBuffer()
      const name = isPdf(it.file) ? it.file.name : `${it.file.name.replace(/\.[^.]+$/, "")}__${tagOf(it, targetKB)}${isGif(it.file) ? ".gif" : ".jpg"}`
      zip.file(name, buf)
    }
    const zblob = await zip.generateAsync({ type: "blob" })
    const url = URL.createObjectURL(zblob)
    const a = document.createElement("a")
    a.href = url; a.download = `compressed-${levelTag}.zip`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }, [items, targetKB, levelTag, downloadOne])

  return { downloadOne, downloadAll }
}
