import { useEffect } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import { isPdf } from "../lib/file"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

export function useThumbs() {
  const { items, setItems } = useCompressor()

  useEffect(() => {
    let cancelled = false
    items.forEach(async it => {
      if (!isPdf(it.file) || it.thumb) return
      try {
        const pdfjs = await import("pdfjs-dist") as unknown as { GlobalWorkerOptions: { workerSrc: string }; getDocument: (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n:number)=>Promise<{getViewport:(o:{scale:number})=>{width:number;height:number}; render:(o:{canvasContext:CanvasRenderingContext2D; viewport:unknown})=>{promise:Promise<void>}}> }> } }
        ;(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = pdfWorkerUrl
        const data = await it.file.arrayBuffer()
        const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
        const page = await doc.getPage(1)
        const vp = page.getViewport({ scale: 0.3 })
        const c = document.createElement("canvas")
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
        const ctx = c.getContext("2d")!
        ctx.fillStyle = "#fff"; ctx.fillRect(0,0,c.width,c.height)
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        const url = c.toDataURL("image/jpeg", 0.7)
        if (!cancelled) setItems(prev => prev.map(p => p.id === it.id ? { ...p, thumb: url } : p))
      } catch { /* ignore */ }
    })
    return () => { cancelled = true }
  }, [items.map(i=>i.id).join(","), setItems])
}
