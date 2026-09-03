import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { flateContentStreams } from "../../compression/lib/optimizePdf"

export type PageRef = {
  id: string
  sourceId: string
  sourcePageIdx: number // 1-based
  thumb: string
  fileName: string
}

function uid() { return Math.random().toString(36).slice(2, 9) }

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist") as unknown as {
    GlobalWorkerOptions: { workerSrc: string }
    getDocument: (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }> }> }
  }
  ;(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  return pdfjs
}

export async function getPdfPageCount(file: File): Promise<number> {
  const pdfjs = await getPdfJs()
  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  return doc.numPages
}

export async function extractPages(
  file: File,
  sourceId: string,
  opts?: { onPage?: (p: PageRef, idx: number, total: number) => void; signal?: AbortSignal; scale?: number }
): Promise<PageRef[]> {
  const pdfjs = await getPdfJs()
  const data = await file.arrayBuffer()
  if (opts?.signal?.aborted) return []
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  const out: PageRef[] = []
  const scale = opts?.scale ?? 0.25 // ponytail: 0.25 ~50% fewer pixels than 0.35, still crisp at 150px grid
  const c = document.createElement("canvas")
  const ctx = c.getContext("2d")!
  const total = doc.numPages
  for (let i = 1; i <= total; i++) {
    if (opts?.signal?.aborted) break
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale })
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    const thumb = c.toDataURL("image/jpeg", 0.65)
    const ref: PageRef = { id: uid(), sourceId, sourcePageIdx: i, thumb, fileName: file.name }
    out.push(ref)
    opts?.onPage?.(ref, i, total)
    // yield to keep UI responsive — first thumb <300ms, streams instead of 20s blank
    if (typeof requestAnimationFrame !== "undefined") {
      await new Promise<void>(r => requestAnimationFrame(() => r()))
    } else {
      await new Promise<void>(r => setTimeout(r, 0))
    }
  }
  return out
}

// merge pages in order -> PDF bytes via pdf-lib copyPages (lossless)
export async function mergePages(pages: PageRef[], sourceMap: Map<string, File | Blob>): Promise<Uint8Array> {
  const pdfLib = await import("pdf-lib")
  const { PDFDocument } = pdfLib
  const outDoc = await PDFDocument.create()
  // cache loaded docs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loaded = new Map<string, any>()
  for (const p of pages) {
    let srcDoc = loaded.get(p.sourceId)
    if (!srcDoc) {
      const blob = sourceMap.get(p.sourceId)
      if (!blob) throw new Error(`missing source ${p.fileName}`)
      const buf = await blob.arrayBuffer()
      srcDoc = await PDFDocument.load(buf)
      loaded.set(p.sourceId, srcDoc)
    }
    const [copied] = await outDoc.copyPages(srcDoc, [p.sourcePageIdx - 1])
    outDoc.addPage(copied)
  }
  // ponytail: copied pages drag raw content streams along — flate them before saving
  try {
    await flateContentStreams(outDoc, pdfLib)
  } catch { /* save anyway */ }
  return await outDoc.save({ useObjectStreams: true })
}
