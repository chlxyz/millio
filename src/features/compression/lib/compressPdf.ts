import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import type { CompressResult } from "./types"

export async function compressPdfToTarget(
  file: File,
  targetKB: number,
  onProgress?: (done: number, total: number) => void
): Promise<CompressResult> {
  const targetBytes = targetKB * 1024
  if (file.size <= targetBytes) {
    return { blob: file, size: file.size, quality: 1, scale: 1, keptOriginal: true }
  }

  const buf = await file.arrayBuffer()
  const pdfjs: unknown = await import("pdfjs-dist")
  const pdfLibMod = await import("pdf-lib")
  const { PDFDocument } = pdfLibMod as { PDFDocument: typeof import("pdf-lib").PDFDocument }

  const pdfjsAny = pdfjs as { GlobalWorkerOptions?: { workerSrc: string } }
  if (pdfjsAny.GlobalWorkerOptions) pdfjsAny.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const getDoc = (pdfjs as { getDocument: (o: unknown) => { promise: Promise<unknown> } }).getDocument
  const loading = getDoc({ data: new Uint8Array(buf) } as unknown)
  const pdf = await loading.promise as {
    numPages: number
    getPage: (n: number) => Promise<{
      getViewport: (o: { scale: number }) => { width: number; height: number }
      render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> }
    }>
  }

  const totalPages = pdf.numPages
  let best: { bytes: Uint8Array; q: number; s: number } | null = null
  const scales = [1, 0.85, 0.7, 0.55, 0.4]
  const baseDpiScale = 1.2

  for (const s of scales) {
    let low = 0.1, high = 0.92
    let localBest: { bytes: Uint8Array; q: number } | null = null
    for (let iter = 0; iter < 6; iter++) {
      const mid = (low + high) / 2
      const out = await renderPdfToBytes(pdf as unknown as never, mid, s * baseDpiScale, PDFDocument, onProgress)
      if (out.length <= targetBytes) {
        localBest = { bytes: out, q: mid }
        low = mid + 0.02
      } else {
        high = mid - 0.02
      }
      if (high < low) break
    }
    if (localBest) {
      if (!best || localBest.bytes.length > (best as { bytes: Uint8Array }).bytes.length) {
        best = { bytes: localBest.bytes, q: localBest.q, s }
      }
      if (localBest.bytes.length >= targetBytes * 0.985) break
      break
    }
    if (onProgress) onProgress(0, totalPages)
  }

  if (best) {
    const blob = new Blob([best.bytes as unknown as BlobPart], { type: "application/pdf" })
    return { blob, size: blob.size, quality: best.q, scale: best.s, keptOriginal: false }
  }

  const fallbackBytes = await renderPdfToBytes(pdf as unknown as never, 0.1, scales[scales.length - 1] * baseDpiScale, PDFDocument, onProgress)
  const blob = new Blob([fallbackBytes as unknown as BlobPart], { type: "application/pdf" })
  return { blob, size: blob.size, quality: 0.1, scale: scales[scales.length - 1], keptOriginal: false }
}

async function renderPdfToBytes(
  pdf: { numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }> },
  jpegQuality: number,
  renderScale: number,
  PDFDocument: typeof import("pdf-lib").PDFDocument,
  onProgress?: (d: number, t: number) => void
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: renderScale })
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error("pdf canvas toBlob")), "image/jpeg", jpegQuality)
    )
    const arr = new Uint8Array(await blob.arrayBuffer())
    const jpg = await pdfDoc.embedJpg(arr)
    const pg = pdfDoc.addPage([jpg.width, jpg.height])
    pg.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height })
    if (onProgress) onProgress(i, pdf.numPages)
  }
  return await pdfDoc.save()
}
