import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import type { Item } from "../types/file"
import { isImage, isPdf } from "../features/compression/lib/file"

type Ctx = {
  items: Item[]
  targetKB: number
  setTargetKB: (v: number) => void
  addFiles: (files: FileList | File[]) => void
  setItems: React.Dispatch<React.SetStateAction<Item[]>>
  clearAll: () => void
}

const CompressorContext = createContext<Ctx | null>(null)

function uid() { return Math.random().toString(36).slice(2, 9) }

export function CompressorProvider({ children }: { children: ReactNode }) {
  const [targetKB, setTargetKB] = useState(500)
  const [items, setItems] = useState<Item[]>([])

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => isImage(f) || isPdf(f))
    if (!arr.length) return
    setItems(prev => [
      ...prev,
      ...arr.map(f => ({
        id: uid(),
        file: f,
        status: "queued" as const,
        originalSize: f.size,
        thumb: isImage(f) ? URL.createObjectURL(f) : undefined,
      })),
    ])
  }, [])

  const clearAll = useCallback(() => {
    setItems(prev => {
      prev.forEach(i => { if (i.thumb?.startsWith("blob:")) URL.revokeObjectURL(i.thumb) })
      return []
    })
  }, [])

  return (
    <CompressorContext.Provider value={{ items, targetKB, setTargetKB, addFiles, setItems, clearAll }}>
      {children}
    </CompressorContext.Provider>
  )
}

export function useCompressor() {
  const ctx = useContext(CompressorContext)
  if (!ctx) throw new Error("useCompressor must be inside CompressorProvider")
  return ctx
}
