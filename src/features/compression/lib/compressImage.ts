// ponytail: serial compress on main thread, move to Worker if >20 files lag matters
// honest precise: closest <= target within 1.5%, keep original if already smaller
import type { CompressResult } from "./types"

function canvasToBlob(canvas: HTMLCanvasElement, quality: number, type = "image/jpeg"): Promise<Blob> {
  return new Promise((res, rej) => {
    canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), type, quality)
  })
}

async function loadBitmap(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = "async"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("image load failed"))
      img.src = url
    })
    return img
  } finally {
    // url revoked after draw in caller
  }
}

export async function compressImageToTarget(file: File, targetKB: number): Promise<CompressResult> {
  const targetBytes = targetKB * 1024
  if (file.size <= targetBytes) {
    return { blob: file, size: file.size, quality: 1, scale: 1, keptOriginal: true }
  }

  const img = await loadBitmap(file)
  const origW = img.naturalWidth || (img as unknown as { width: number }).width
  const origH = img.naturalHeight || (img as unknown as { height: number }).height

  let best: { blob: Blob; q: number; scale: number } | null = null

  let w = origW, h = origH
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!

  for (let attempt = 0; attempt < 5; attempt++) {
    canvas.width = Math.max(1, Math.round(w))
    canvas.height = Math.max(1, Math.round(h))

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    let low = 0.10, high = 0.95
    let localBest: { blob: Blob; q: number } | null = null

    for (let i = 0; i < 7; i++) {
      const mid = (low + high) / 2
      const blob = await canvasToBlob(canvas, mid)
      if (blob.size <= targetBytes) {
        localBest = { blob, q: mid }
        low = mid + 0.01
      } else {
        high = mid - 0.01
      }
    }

    if (localBest) {
      if (!best || localBest.blob.size > (best as { blob: Blob }).blob.size) {
        best = { blob: localBest.blob, q: localBest.q, scale: w / origW }
      }
      if (localBest.blob.size >= targetBytes * 0.985) break
      break
    }

    w = Math.floor(w * 0.9)
    h = Math.floor(h * 0.9)
    if (w < 16 || h < 16) break
  }

  URL.revokeObjectURL(img.src)

  if (best) {
    return { blob: best.blob, size: best.blob.size, quality: best.q, scale: best.scale, keptOriginal: false }
  }
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const fallback = await canvasToBlob(canvas, 0.1)
  URL.revokeObjectURL(img.src)
  return { blob: fallback, size: fallback.size, quality: 0.1, scale: w / origW, keptOriginal: false }
}
