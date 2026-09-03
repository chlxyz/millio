// Lossless stream optimization: Flate-encode uncompressed page content streams.
// This is where tools like iLovePDF win on text PDFs — raw content streams often dwarf
// everything else, and pdf-lib's save() preserves their encoding as-is. Zero quality change,
// text/vectors untouched. Needs platform CompressionStream (all modern browsers + node 18+).
type PdfLib = typeof import("pdf-lib")

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    if (typeof CompressionStream === "undefined") return null
    const out = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"))
    return new Uint8Array(await new Response(out).arrayBuffer())
  } catch {
    return null
  }
}

// Flate-encodes every uncompressed page content stream in place. Returns count optimized.
export async function flateContentStreams(
  pdfDoc: import("pdf-lib").PDFDocument,
  pdfLib: PdfLib,
): Promise<number> {
  const { PDFName, PDFRef, PDFRawStream, PDFArray, PDFNumber } = pdfLib
  let count = 0
  for (const page of pdfDoc.getPages()) {
    let refs: { ref: import("pdf-lib").PDFRef | null; set: (s: import("pdf-lib").PDFRawStream) => void; stream: import("pdf-lib").PDFRawStream }[]
    try {
      const Contents = PDFName.of("Contents")
      // ponytail: .get(), NOT .lookup() — lookup derefs refs, which would make every
      // ref-entry look direct; replacing it then orphans nothing and duplicates bytes
      const contents = page.node.get(Contents)
      const entries: { obj: unknown; set: (s: import("pdf-lib").PDFRawStream) => void }[] = []
      if (contents instanceof PDFRef) {
        entries.push({ obj: pdfDoc.context.lookup(contents), set: (s) => pdfDoc.context.assign(contents, s) })
      } else if (contents instanceof PDFArray) {
        for (let i = 0; i < contents.size(); i++) {
          const item = contents.get(i)
          if (item instanceof PDFRef) {
            const idx = i
            entries.push({ obj: pdfDoc.context.lookup(item), set: (s) => (contents as import("pdf-lib").PDFArray).set(idx, s) })
          } else if (item instanceof PDFRawStream) {
            const idx = i
            entries.push({ obj: item, set: (s) => (contents as import("pdf-lib").PDFArray).set(idx, s) })
          }
        }
      } else if (contents instanceof PDFRawStream) {
        // direct (non-indirect) content stream — common in office/scanner exports
        entries.push({ obj: contents, set: (s) => page.node.set(Contents, s) })
      } else continue
      refs = []
      for (const e of entries) {
        if (e.obj instanceof PDFRawStream) refs.push({ ref: null, set: e.set, stream: e.obj })
      }
    } catch { continue }
    for (const r of refs) {
      try {
        const dict = r.stream.dict
        if (dict.lookup(PDFName.of("Filter")) !== undefined) continue // already encoded — hands off
        const raw = r.stream.getContents()
        if (raw.length < 100) continue // header rows etc — deflate overhead isn't worth it
        const deflated = await deflateRaw(raw)
        if (!deflated || deflated.length >= raw.length) continue
        dict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"))
        dict.set(PDFName.of("Length"), PDFNumber.of(deflated.length))
        r.set(pdfLib.PDFRawStream.of(dict, deflated))
        count += 1
      } catch { /* keep original stream on any failure */ }
    }
  }
  return count
}

// Load → flate content streams → object-stream save. The lossless step for every pipeline.
export async function optimizedSave(pdfLib: PdfLib, buf: ArrayBuffer): Promise<Uint8Array> {
  const pdfDoc = await pdfLib.PDFDocument.load(buf.slice(0))
  try {
    await flateContentStreams(pdfDoc, pdfLib)
  } catch { /* save anyway */ }
  return await pdfDoc.save({ useObjectStreams: true })
}
