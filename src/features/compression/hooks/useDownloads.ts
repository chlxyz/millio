import { useCallback } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import { isPdf } from "../lib/file"
import type { Item } from "../../../types/file"

export function useDownloads() {
  const { items, targetKB } = useCompressor()

  const downloadOne = useCallback((it: Item) => {
    const blob = it.outBlob ?? it.file
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const ext = isPdf(it.file) ? ".pdf" : ".jpg"
    const base = it.file.name.replace(/\.[^.]+$/, "")
    a.href = url; a.download = isPdf(it.file) ? it.file.name : `${base}__${targetKB}kb${ext}`
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
      const name = isPdf(it.file) ? it.file.name : `${it.file.name.replace(/\.[^.]+$/, "")}__${targetKB}kb.jpg`
      zip.file(name, buf)
    }
    const zblob = await zip.generateAsync({ type: "blob" })
    const url = URL.createObjectURL(zblob)
    const a = document.createElement("a")
    a.href = url; a.download = `compressed-${targetKB}kb.zip`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }, [items, targetKB, downloadOne])

  return { downloadOne, downloadAll }
}
