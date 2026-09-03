// Vector-safe PDF shrink: downsample embedded JPEG images in place, leave text/vectors
// untouched (stays selectable). v1 scope: DCTDecode streams only — Flate pixel data isn't
// browser-decodable, masked/bilevel images are skipped. Per-image try/catch: skip on anything odd.
export type DownsamplePick = { bytes: Uint8Array; scale: number; quality: number }

type PdfLib = typeof import("pdf-lib")

const MIN_PX = 64 // ignore icons/thumbnails — no meaningful bytes there

function canvasJpeg(canvas: HTMLCanvasElement, bmp: ImageBitmap, w: number, h: number, quality: number): Promise<Blob> {
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((res, rej) => {
    canvas.toBlob(b => (b ? res(b) : rej(new Error("downsample toBlob failed"))), "image/jpeg", quality)
  })
}

export async function downsamplePdfImages(
  pdfLib: PdfLib,
  originalBuf: ArrayBuffer,
  opts: { scales: number[]; quality: number; targetBytes: number | null; originalSize: number; onProgress?: (done: number, total: number) => void }
): Promise<DownsamplePick | null> {
  const { PDFName, PDFDict, PDFRef, PDFRawStream, PDFArray } = pdfLib
  // ponytail: one candidate at a time on huge files — each reload copies the whole buffer
  const tryScales = originalBuf.byteLength > 50 * 1024 * 1024 ? opts.scales.slice(0, 1) : opts.scales
  const canvas = document.createElement("canvas")
  let best: DownsamplePick | null = null

  for (const scale of tryScales) {
    let pdfDoc: import("pdf-lib").PDFDocument
    try {
      pdfDoc = await pdfLib.PDFDocument.load(originalBuf.slice(0))
    } catch { return best }

    // collect occurrences; shared refs must swap on EVERY page that uses them
    const jobs: { xobjects: import("pdf-lib").PDFDict; name: import("pdf-lib").PDFName; key: string; ref: import("pdf-lib").PDFRef | null; w: number; h: number; bytes: Uint8Array }[] = []
    let direct = 0
    try {
      for (const page of pdfDoc.getPages()) {
        const res = page.node.Resources()
        if (!res) continue
        const xo = res.lookup(PDFName.of("XObject"))
        if (!(xo instanceof PDFDict)) continue
        for (const [name, obj] of xo.entries()) {
          try {
            const ref = obj instanceof PDFRef ? obj : null
            const stream = ref ? pdfDoc.context.lookup(ref) : obj
            if (!(stream instanceof PDFRawStream)) continue
            const dict = stream.dict
            if (dict.lookup(PDFName.of("Subtype"))?.toString() !== "/Image") continue
            if (dict.has(PDFName.of("SMask")) || dict.has(PDFName.of("ImageMask"))) continue
            const filter = dict.lookup(PDFName.of("Filter"))
            if (filter instanceof PDFArray) continue // multi-filter — leave alone
            if (filter?.toString() !== "/DCTDecode") continue
            const w = Number(dict.lookup(PDFName.of("Width"))?.toString())
            const h = Number(dict.lookup(PDFName.of("Height"))?.toString())
            if (!w || !h || w < MIN_PX || h < MIN_PX) continue
            jobs.push({ xobjects: xo, name, key: ref ? ref.toString() : `direct-${direct++}`, ref, w, h, bytes: stream.getContents() })
          } catch { /* skip hostile XObjects */ }
        }
      }
    } catch { return best }
    if (!jobs.length) return best

    const byKey = new Map<string, typeof jobs>()
    for (const j of jobs) {
      const g = byKey.get(j.key)
      if (g) g.push(j)
      else byKey.set(j.key, [j])
    }
    const groups = [...byKey.values()]
    let done = 0
    for (const group of groups) {
      const first = group[0]
      try {
        const bmp = await createImageBitmap(new Blob([first.bytes as unknown as BlobPart], { type: "image/jpeg" }))
        try {
          const blob = await canvasJpeg(canvas, bmp, first.w * scale, first.h * scale, opts.quality)
          const nb = new Uint8Array(await blob.arrayBuffer())
          if (nb.length < first.bytes.length) {
            const embedded = await pdfDoc.embedJpg(nb)
            for (const occ of group) occ.xobjects.set(occ.name, embedded.ref)
            if (first.ref && typeof (pdfDoc.context as unknown as { delete?: unknown }).delete === "function") {
              try { (pdfDoc.context as unknown as { delete: (r: unknown) => void }).delete(first.ref) } catch { /* orphan stays, still valid */ }
            }
          }
        } finally {
          bmp.close()
        }
      } catch { /* keep original image on any failure */ }
      done += 1
      opts.onProgress?.(done, groups.length)
    }

    let out: Uint8Array
    try {
      out = await pdfDoc.save({ useObjectStreams: true })
    } catch { continue }
    if (out.length < opts.originalSize && (!best || out.length < best.bytes.length)) {
      best = { bytes: out, scale, quality: opts.quality }
    }
    if (opts.targetBytes !== null && out.length <= opts.targetBytes) break
  }
  return best
}
