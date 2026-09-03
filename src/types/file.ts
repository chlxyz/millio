export type LevelKind = "auto" | "percent" | "custom"
export type Level = { kind: LevelKind; percent: number; customKB: number }
export const DEFAULT_LEVEL: Level = { kind: "auto", percent: 50, customKB: 500 }
export const MIN_KB = 1
export const MAX_KB = 512000 // 500 MB practical browser cap

// iLovePDF-like: percent resolves per file against its own original;
// custom is an exact per-file ceiling; auto means smallest readable.
export function targetBytesFor(originalSize: number, level: Level): number | null {
  if (level.kind === "auto") return null
  if (level.kind === "percent") return Math.max(1024, Math.floor(originalSize * level.percent / 100))
  return Math.max(1024, Math.round(level.customKB * 1024))
}

export type Item = {
  id: string
  file: File
  status: "pending" | "queued" | "compressing" | "done" | "kept" | "error"
  progress?: string
  thumb?: string
  originalSize: number
  outBlob?: Blob
  outSize?: number
  kept?: boolean
  error?: string
  quality?: number
  scale?: number
  belowReadableFloor?: boolean
  levelKind?: LevelKind
  targetBytes?: number
  appliedLabel?: string
  keptReason?: "under-target" | "already-efficient"
  vectorSafe?: boolean
}
