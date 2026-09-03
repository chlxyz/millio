import { useEffect, useRef } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import { isGif, isPdf } from "../lib/file"
import { compressImageToMinimum, compressImageToTarget } from "../lib/compressImage"
import { compressPdfToMinimum, compressPdfToTarget } from "../lib/compressPdf"
import { compressGifToMinimum, compressGifToTarget } from "../lib/compressGif"
import { targetBytesFor, type Item, type Level } from "../../../types/file"
import { fmtBytes } from "../../../lib/format"
import type { CompressResult } from "../lib/types"

function appliedLabel(level: Level, targetBytes: number | null): string {
  if (level.kind === "auto") return "Auto"
  if (level.kind === "percent") return `${level.percent}%`
  return `≤ ${fmtBytes((targetBytes ?? level.customKB * 1024))}`
}

// ponytail: manual flow — nothing runs until LevelPicker Confirm bumps compressNonce
export function useCompression() {
  const { items, level, setItems, compressNonce } = useCompressor()
  const compressingRef = useRef(false)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const levelRef = useRef(level)
  levelRef.current = level
  const nonceRef = useRef(compressNonce)
  const setItemsRef = useRef(setItems)
  setItemsRef.current = setItems

  useEffect(() => {
    if (nonceRef.current === compressNonce) return
    nonceRef.current = compressNonce
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compressNonce])

  async function run() {
    if (compressingRef.current) return
    const runNonce = nonceRef.current
    const active = levelRef.current
    // mark everything needing work as queued (pending first-timers + re-compress of done/kept/error)
    const queue = itemsRef.current.filter(it =>
      it.status === "pending" || it.status === "queued" || it.status === "done" || it.status === "kept" || it.status === "error"
    )
    if (!queue.length) return
    compressingRef.current = true
    const set = setItemsRef.current
    set(prev => prev.map(it => {
      if (it.status !== "pending" && it.status !== "queued" && it.status !== "done" && it.status !== "kept" && it.status !== "error") return it
      const tb = targetBytesFor(it.originalSize, active)
      if (tb !== null && it.originalSize <= tb) {
        return { ...it, status: "kept" as const, outBlob: it.file, outSize: it.originalSize, kept: true, error: undefined, progress: undefined, belowReadableFloor: undefined, levelKind: active.kind, targetBytes: tb, appliedLabel: appliedLabel(active, tb), keptReason: "under-target" as const }
      }
      return { ...it, status: "queued" as const, progress: undefined, error: undefined, levelKind: active.kind, targetBytes: tb ?? undefined, appliedLabel: appliedLabel(active, tb) }
    }))
    // let mark commit, then snapshot ids to process
    await new Promise(r => setTimeout(r, 0))
    const snap = itemsRef.current.filter(i => i.status === "queued")
    for (const it of snap) {
      set(prev => prev.map(p => p.id === it.id ? { ...p, status: "compressing" as const, progress: isPdf(it.file) ? "0/– pages" : isGif(it.file) ? "compressing gif…" : "compressing…" } : p))
      try {
        const tb = targetBytesFor(it.originalSize, levelRef.current)
        if (tb !== null && it.originalSize <= tb) {
          set(prev => prev.map(p => p.id === it.id ? { ...p, status: "kept" as const, outBlob: it.file, outSize: it.originalSize, kept: true, keptReason: "under-target" as const } : p))
          continue
        }
        let res: CompressResult
        if (tb === null) {
          // Auto: smallest readable, no search
          if (isPdf(it.file)) {
            res = await compressPdfToMinimum(it.file, (done, total) => {
              set(prev => prev.map(p => p.id === it.id ? { ...p, progress: `${done}/${total} pages` } : p))
            })
          } else if (isGif(it.file)) {
            res = await compressGifToMinimum(it.file)
          } else {
            res = await compressImageToMinimum(it.file)
          }
        } else if (isPdf(it.file)) {
          res = await compressPdfToTarget(it.file, tb / 1024, (done, total) => {
            set(prev => prev.map(p => p.id === it.id ? { ...p, progress: `${done}/${total} pages` } : p))
          })
        } else if (isGif(it.file)) {
          res = await compressGifToTarget(it.file, tb / 1024)
        } else {
          res = await compressImageToTarget(it.file, tb / 1024)
        }
        // ponytail: universal net — output must never exceed the input, whatever the path returned
        if (!res.keptOriginal && res.size >= it.originalSize) {
          set(prev => prev.map(p => p.id === it.id ? { ...p, status: "kept" as const, outBlob: it.file, outSize: it.originalSize, kept: true, progress: undefined, belowReadableFloor: undefined, keptReason: "already-efficient" as const } : p))
        } else if (res.keptOriginal) {
          set(prev => prev.map(p => p.id === it.id ? { ...p, status: "kept" as const, outBlob: res.blob, outSize: res.size, kept: true, progress: undefined, belowReadableFloor: undefined, keptReason: (res.alreadyEfficient || levelRef.current.kind === "auto" ? "already-efficient" : "under-target") as Item["keptReason"] } : p))
        } else {
          set(prev => prev.map(p => p.id === it.id ? { ...p, status: "done" as const, outBlob: res.blob, outSize: res.size, quality: res.quality, scale: res.scale, belowReadableFloor: res.belowReadableFloor, vectorSafe: res.vectorSafe, progress: undefined } : p))
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "failed"
        set(prev => prev.map(p => p.id === it.id ? { ...p, status: "error" as const, error: msg, progress: undefined } : p))
      }
      await new Promise(r => setTimeout(r, 0))
    }
    compressingRef.current = false
    // ponytail: a Confirm that landed mid-run would've been dropped above — pick it up
    if (nonceRef.current !== runNonce) void run()
  }
}
