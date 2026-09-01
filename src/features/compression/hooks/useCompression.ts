import { useEffect, useRef } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import { isPdf } from "../lib/file"
import { compressImageToTarget } from "../lib/compressImage"
import { compressPdfToTarget } from "../lib/compressPdf"

export function useCompression() {
  const { items, targetKB, setItems } = useCompressor()
  const compressingRef = useRef(false)

  // debounce queued
  useEffect(() => {
    if (!items.length || compressingRef.current) return
    const queued = items.some(i => i.status === "queued")
    if (!queued) return
    const t = setTimeout(() => run(), 300)
    return () => clearTimeout(t)
  }, [items])

  // re-compress on slider change
  const prevTargetRef = useRef(targetKB)
  useEffect(() => {
    if (prevTargetRef.current === targetKB) return
    prevTargetRef.current = targetKB
    if (!items.length) return
    setItems(prev => prev.map(it => {
      const targetBytes = targetKB * 1024
      if (it.originalSize <= targetBytes) {
        return { ...it, status: "kept" as const, outBlob: it.file, outSize: it.originalSize, kept: true, error: undefined, progress: undefined }
      }
      return { ...it, status: "queued" as const, progress: undefined, error: undefined }
    }))
    setTimeout(() => run(), 100)
  }, [targetKB, items.length, setItems])

  async function run() {
    if (compressingRef.current) return
    compressingRef.current = true
    // snapshot queued at start
    const snap = items.filter(i => i.status === "queued")
    // need fresh snapshot after state updates? use current items ref via closure may be stale; instead read via setItems callback
    // we loop over snap captured; for re-entrancy we rely on effect re-trigger
    for (const it of snap) {
      setItems(prev => prev.map(p => p.id === it.id ? { ...p, status: "compressing" as const, progress: isPdf(it.file) ? "0/– pages" : "compressing…" } : p))
      try {
        const targetBytes = targetKB * 1024
        if (it.originalSize <= targetBytes) {
          setItems(prev => prev.map(p => p.id === it.id ? { ...p, status: "kept" as const, outBlob: it.file, outSize: it.originalSize, kept: true } : p))
          continue
        }
        let res: { blob: Blob; size: number; quality: number; keptOriginal: boolean }
        if (isPdf(it.file)) {
          res = await compressPdfToTarget(it.file, targetKB, (done, total) => {
            setItems(prev => prev.map(p => p.id === it.id ? { ...p, progress: `${done}/${total} pages` } : p))
          })
        } else {
          res = await compressImageToTarget(it.file, targetKB)
        }
        if (res.keptOriginal) {
          setItems(prev => prev.map(p => p.id === it.id ? { ...p, status: "kept" as const, outBlob: res.blob, outSize: res.size, kept: true, progress: undefined } : p))
        } else {
          setItems(prev => prev.map(p => p.id === it.id ? { ...p, status: "done" as const, outBlob: res.blob, outSize: res.size, quality: res.quality, progress: undefined } : p))
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "failed"
        setItems(prev => prev.map(p => p.id === it.id ? { ...p, status: "error" as const, error: msg, progress: undefined } : p))
      }
      await new Promise(r => setTimeout(r, 0))
    }
    compressingRef.current = false
    setItems(prev => {
      if (prev.some(p => p.status === "queued") && !compressingRef.current) {
        setTimeout(() => run(), 0)
      }
      return prev
    })
  }
}
