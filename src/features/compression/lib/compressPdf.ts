import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import type { CompressResult } from "./types"
import { downsamplePdfImages, type DownsamplePick } from "./downsamplePdf"
import { optimizedSave } from "./optimizePdf"

// Readability floors — rasterizing below these turns text to mush, so we never go lower.
// Worst case 0.65 * 2.0 = 1.3x ≈ 125 DPI at JPEG q0.5. If the target can't be hit
// within floors, we return the smallest readable attempt flagged belowReadableFloor.
const MIN_Q = 0.5
const MAX_Q = 0.92
const BASE_DPI_SCALE = 2.0
const SCALES = [1, 0.8, 0.65]
const Q_ITERS = 4
const CLOSE_ENOUGH = 0.985
// ponytail: sample-then-render — search quality on ≤3 pages (JPEG-only), one full render.
// Old code did up to 12 full-document passes × dual JPEG+PNG encode per page.
const MAX_SAMPLE_PAGES = 3

type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> }
}
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> }

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => {
    canvas.toBlob(b => (b ? res(b) : rej(new Error("pdf canvas toBlob failed"))), type, quality)
  })
}

function samplePageNums(total: number): number[] {
  if (total <= MAX_SAMPLE_PAGES) return Array.from({ length: total }, (_, i) => i + 1)
  const mid = Math.ceil(total / 2)
  return [1, mid, total]
}

async function renderPageJpegSize(
  pdf: PdfDoc, pageNum: number, renderScale: number, quality: number,
  canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D,
): Promise<number> {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale: renderScale })
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  const jpeg = await canvasToBlob(canvas, "image/jpeg", quality)
  return jpeg.size
}

async function loadPdf(buf: ArrayBuffer): Promise<{ pdf: PdfDoc; PDFDocument: typeof import("pdf-lib").PDFDocument; pdfLib: typeof import("pdf-lib") }> {
  const pdfjs: unknown = await import("pdfjs-dist")
  const pdfLib = await import("pdf-lib")
  const { PDFDocument } = pdfLib as { PDFDocument: typeof import("pdf-lib").PDFDocument }
  const pdfjsAny = pdfjs as { GlobalWorkerOptions?: { workerSrc: string } }
  if (pdfjsAny.GlobalWorkerOptions) pdfjsAny.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const getDoc = (pdfjs as { getDocument: (o: unknown) => { promise: Promise<unknown> } }).getDocument
  const loading = getDoc({ data: new Uint8Array(buf) } as unknown)
  const pdf = (await loading.promise) as unknown as PdfDoc
  return { pdf, PDFDocument, pdfLib }
}

// Auto level: smallest readable, no search — lossless try, else ONE floor render.
export async function compressPdfToMinimum(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<CompressResult> {
  const buf = await file.arrayBuffer()
  const { pdf, PDFDocument, pdfLib } = await loadPdf(buf)
  try {
    // lossless: flate raw content streams + object streams — the iLovePDF win on text PDFs
    const losslessBytes = await optimizedSave(pdfLib, buf)
    if (losslessBytes.length < file.size) {
      const blob = new Blob([losslessBytes as unknown as BlobPart], { type: "application/pdf" })
      return { blob, size: blob.size, quality: 1, scale: 1, keptOriginal: false, vectorSafe: true }
    }
  } catch { /* fall through to raster path */ }
  // vector-safe shrink first: embedded photos downsampled, text stays selectable
  // vector-safe shrink first: embedded photos downsampled, text stays selectable
  try {
    const ds = await downsamplePdfImages(pdfLib, buf, { scales: [0.5], quality: 0.72, targetBytes: null, originalSize: file.size, onProgress })
    if (ds) {
      const blob = new Blob([ds.bytes as unknown as BlobPart], { type: "application/pdf" })
      return { blob, size: blob.size, quality: ds.quality, scale: ds.scale, keptOriginal: false, vectorSafe: true }
    }
  } catch { /* fall through to raster path */ }
  const s = SCALES[SCALES.length - 1]
  const bytes = await renderHybrid(pdf, MIN_Q, s * BASE_DPI_SCALE, PDFDocument, onProgress)
  if (bytes.length >= file.size) {
    return { blob: file, size: file.size, quality: 1, scale: 1, keptOriginal: true }
  }
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" })
  return { blob, size: blob.size, quality: MIN_Q, scale: s, keptOriginal: false }
}

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
  const { pdf, PDFDocument, pdfLib } = await loadPdf(buf)

  const totalPages = pdf.numPages

  // Step 0: lossless — flate raw content streams + object streams. Free bytes, zero quality loss.
  try {
    const losslessBytes = await optimizedSave(pdfLib, buf)
    if (losslessBytes.length <= targetBytes) {
      const blob = new Blob([losslessBytes as unknown as BlobPart], { type: "application/pdf" })
      return { blob, size: blob.size, quality: 1, scale: 1, keptOriginal: false, vectorSafe: true }
    }
  } catch { /* fall through */ }

  // Step 1: vector-safe shrink — downsample embedded photos, text stays selectable.
  // Anything found here becomes the baseline the raster path must beat.
  let base: DownsamplePick | null = null
  try {
    const ds = await downsamplePdfImages(pdfLib, buf, { scales: [0.7, 0.5, 0.35], quality: 0.72, targetBytes, originalSize: file.size, onProgress })
    if (ds && ds.bytes.length <= targetBytes) {
      const blob = new Blob([ds.bytes as unknown as BlobPart], { type: "application/pdf" })
      return { blob, size: blob.size, quality: ds.quality, scale: ds.scale, keptOriginal: false, vectorSafe: true }
    }
    base = ds
  } catch { /* fall through to raster path */ }
  const baseline = base && base.bytes.length < file.size ? base.bytes.length : file.size

  // Search on samples only (JPEG-only encodes) → pick (q, s), then ONE full render.
  const samples = samplePageNums(totalPages)
  const ratio = totalPages / samples.length
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!
  if (onProgress) onProgress(0, totalPages)

  // ponytail: raster-vs-original probe — on text/vector PDFs even the floor raster is
  // bigger than the original, so no readable attempt can win. Skip the search + render,
  // return lossless savings if any, else keep. One mid-doc page, floor settings.
  const probePage = Math.max(1, Math.ceil(totalPages / 2))
  const probeBytes = await renderPageJpegSize(pdf, probePage, SCALES[SCALES.length - 1] * BASE_DPI_SCALE, MIN_Q, canvas, ctx)
  if (probeBytes * totalPages + totalPages * 512 >= baseline) {
    if (base && base.bytes.length < file.size) {
      const blob = new Blob([base.bytes as unknown as BlobPart], { type: "application/pdf" })
      return { blob, size: blob.size, quality: base.quality, scale: base.scale, keptOriginal: false, vectorSafe: true, belowReadableFloor: base.bytes.length > targetBytes }
    }
    try {
      const losslessBytes = await optimizedSave(pdfLib, buf)
      if (losslessBytes.length < file.size) {
        const blob = new Blob([losslessBytes as unknown as BlobPart], { type: "application/pdf" })
        return { blob, size: blob.size, quality: 1, scale: 1, keptOriginal: false, vectorSafe: true }
      }
    } catch { /* keep original below */ }
    return { blob: file, size: file.size, quality: 1, scale: 1, keptOriginal: true, alreadyEfficient: true }
  }

  async function estimateFull(q: number, s: number): Promise<number> {
    let sum = 0
    for (const p of samples) {
      sum += await renderPageJpegSize(pdf, p, s * BASE_DPI_SCALE, q, canvas, ctx)
    }
    // JPEG bytes scale ~linearly with pages; pdf container overhead is small vs raster bytes
    return Math.round(sum * ratio) + totalPages * 512
  }

  let bestQ = 0, bestS = 0, bestEst = -1
  let overQ = 0, overS = 0, overEst = -1

  for (const s of SCALES) {
    let low = MIN_Q, high = MAX_Q
    let localQ = 0, localEst = -1
    for (let iter = 0; iter < Q_ITERS; iter++) {
      const mid = (low + high) / 2
      const est = await estimateFull(mid, s)
      if (est <= targetBytes) {
        localQ = mid; localEst = est
        low = mid + 0.02
      } else {
        if (overEst < 0 || est < overEst) { overQ = mid; overS = s; overEst = est }
        high = mid - 0.02
      }
      if (high < low) break
    }
    if (localEst >= 0) {
      if (localEst > bestEst) { bestQ = localQ; bestS = s; bestEst = localEst }
      if (localEst >= targetBytes * CLOSE_ENOUGH) break
      break
    }
  }

  const pick = bestEst >= 0 ? { q: bestQ, s: bestS } : overEst >= 0 ? { q: overQ, s: overS } : { q: MIN_Q, s: SCALES[SCALES.length - 1] }
  const bytes = await renderHybrid(pdf, pick.q, pick.s * BASE_DPI_SCALE, PDFDocument, onProgress)
  // ponytail: output must never exceed the input — rasterizing an efficient PDF bloats it.
  // Anything at-or-over the downsampled baseline loses to it.
  if (bytes.length >= baseline) {
    if (base && base.bytes.length < file.size) {
      const blob = new Blob([base.bytes as unknown as BlobPart], { type: "application/pdf" })
      return { blob, size: blob.size, quality: base.quality, scale: base.scale, keptOriginal: false, vectorSafe: true, belowReadableFloor: base.bytes.length > targetBytes }
    }
    return { blob: file, size: file.size, quality: 1, scale: 1, keptOriginal: true, alreadyEfficient: true }
  }
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" })
  if (bytes.length <= targetBytes) {
    return { blob, size: blob.size, quality: pick.q, scale: pick.s, keptOriginal: false }
  }
  // estimate said it'd fit (or nothing fits readably) — still over: flag minimum readable
  return { blob, size: blob.size, quality: pick.q, scale: pick.s, keptOriginal: false, belowReadableFloor: true }
}

async function renderHybrid(
  pdf: PdfDoc,
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
    // Hybrid pick per page: PNG stays razor-sharp on text/flat pages and is often
    // SMALLER there; JPEG wins on photos. Same render, keep smaller bytes.
    // ponytail: dual-encode only on the single final pass, search passes are JPEG-only
    const [jpeg, png] = await Promise.all([
      canvasToBlob(canvas, "image/jpeg", jpegQuality),
      canvasToBlob(canvas, "image/png"),
    ])
    const usePng = png.size <= jpeg.size
    const arr = new Uint8Array(await (usePng ? png : jpeg).arrayBuffer())
    const img = usePng ? await pdfDoc.embedPng(arr) : await pdfDoc.embedJpg(arr)
    const pg = pdfDoc.addPage([img.width, img.height])
    pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
    if (onProgress) onProgress(i, pdf.numPages)
  }
  return await pdfDoc.save({ useObjectStreams: true })
}
