export type Item = {
  id: string
  file: File
  status: "queued" | "compressing" | "done" | "kept" | "error"
  progress?: string
  thumb?: string
  originalSize: number
  outBlob?: Blob
  outSize?: number
  kept?: boolean
  error?: string
  quality?: number
}
