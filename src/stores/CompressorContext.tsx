import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import type { Item, Level } from "../types/file"
import { DEFAULT_LEVEL } from "../types/file"
import { isImage, isPdf } from "../features/compression/lib/file"

type Ctx = {
  items: Item[]
  targetKB: number
  draftKB: number
  hasPending: boolean
  setTargetKB: (v: number) => void
  setDraftKB: (v: number) => void
  confirmTarget: () => void
  level: Level
  draftLevel: Level
  hasLevelPending: boolean
  setDraftLevel: (v: Level) => void
  confirmLevel: (next?: Level) => void
  compressNonce: number
  requestCompress: () => void
  addFiles: (files: FileList | File[]) => void
  setItems: React.Dispatch<React.SetStateAction<Item[]>>
  clearAll: () => void
  view: "compress" | "pdf-edit"
  setView: (v: "compress" | "pdf-edit") => void
}

const CompressorContext = createContext<Ctx | null>(null)

function uid() { return Math.random().toString(36).slice(2, 9) }

export function CompressorProvider({ children }: { children: ReactNode }) {
  const [targetKB, setTargetKB] = useState(500)
  const [draftKB, setDraftKB] = useState(500)
  const [items, setItems] = useState<Item[]>([])
  const [view, setView] = useState<"compress" | "pdf-edit">("compress")
  const [compressNonce, setCompressNonce] = useState(0)
  const hasPending = draftKB !== targetKB
  const requestCompress = useCallback(() => setCompressNonce(n => n + 1), [])
  const confirmTarget = useCallback(() => {
    if (hasPending) setTargetKB(draftKB)
  }, [hasPending, draftKB])
  // iLovePDF-like levels (legacy targetKB/draftKB stay for the hidden SizeSlider file)
  const [level, setLevel] = useState<Level>(DEFAULT_LEVEL)
  const [draftLevel, setDraftLevel] = useState<Level>(DEFAULT_LEVEL)
  const hasLevelPending = draftLevel.kind !== level.kind || draftLevel.percent !== level.percent || draftLevel.customKB !== level.customKB
  const confirmLevel = useCallback((next?: Level) => {
    setLevel(next ? { ...next } : { ...draftLevel })
  }, [draftLevel])

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => isImage(f) || isPdf(f))
    if (!arr.length) return
    // ponytail: create thumbs BEFORE setState — a throw inside the updater unmounts the root (blank page)
    const staged = arr.map(f => {
      let thumb: string | undefined
      try {
        thumb = isImage(f) ? URL.createObjectURL(f) : undefined
      } catch { thumb = undefined }
      return {
        id: uid(),
        file: f,
        status: "pending" as const,
        originalSize: f.size,
        thumb,
      }
    })
    setItems(prev => {
      // ponytail: fully block adds while a run is active (queued/compressing), allow while pending-before-confirm
      if (prev.some(i => i.status === "queued" || i.status === "compressing")) {
        staged.forEach(i => { if (i.thumb?.startsWith("blob:")) URL.revokeObjectURL(i.thumb) })
        return prev
      }
      return [...prev, ...staged]
    })
  }, [])

  const clearAll = useCallback(() => {
    setItems(prev => {
      prev.forEach(i => { if (i.thumb?.startsWith("blob:")) URL.revokeObjectURL(i.thumb) })
      return []
    })
  }, [])

  return (
    <CompressorContext.Provider value={{ items, targetKB, draftKB, hasPending, setTargetKB, setDraftKB, confirmTarget, level, draftLevel, hasLevelPending, setDraftLevel, confirmLevel, compressNonce, requestCompress, addFiles, setItems, clearAll, view, setView }}>
      {children}
    </CompressorContext.Provider>
  )
}

export function useCompressor() {
  const ctx = useContext(CompressorContext)
  if (!ctx) throw new Error("useCompressor must be inside CompressorProvider")
  return ctx
}
