// ponytail: gifsicle-wasm for auto-max fps under target; keep colors 256, lossy light to preserve quality
import type { CompressResult } from "./types"

type GifsicleRunner = { run: (o: { input: { file: Uint8Array | File | Blob; name: string }[]; command: string[] }) => Promise<File[]> }

let runner: GifsicleRunner | null = null

async function getRunner(): Promise<GifsicleRunner | null> {
  if (runner) return runner
  try {
    const mod = await import("gifsicle-wasm-browser") as unknown as { default: GifsicleRunner; run?: GifsicleRunner["run"]; gifsicle?: GifsicleRunner }
    const def = (mod as unknown as { default?: GifsicleRunner }).default
    const cand = (def ?? mod) as unknown as GifsicleRunner
    if (cand && typeof cand.run === "function") { runner = cand; return cand }
    const alt = mod as unknown as { gifsicle?: GifsicleRunner }
    if (alt.gifsicle && typeof alt.gifsicle.run === "function") { runner = alt.gifsicle; return alt.gifsicle }
    return null
  } catch { return null }
}

async function getOriginalFps(buf: Uint8Array): Promise<number> {
  try {
    const { parseGIF, decompressFrames } = await import("gifuct-js") as unknown as {
      parseGIF: (a: Uint8Array) => unknown
      decompressFrames: (a: unknown, b: boolean) => { delay: number }[]
    }
    const gif = parseGIF(buf)
    const frames = decompressFrames(gif, true) as { delay: number }[]
    if (!frames.length) return 15
    const avgDelay = frames.reduce((s, f) => s + (f.delay || 100), 0) / frames.length
    if (avgDelay <= 0) return 15
    return Math.round(1000 / avgDelay)
  } catch { return 15 }
}

function fpsToDelayCs(fps: number): number {
  return Math.max(2, Math.round(100 / fps))
}

async function gifsicleCompress(buf: Uint8Array, cmd: string): Promise<Uint8Array | null> {
  const r = await getRunner()
  if (!r) return null
  try {
    // gifsicle.run expects input file + command referencing that name, output to /out/out.gif
    const input = [{ file: buf, name: "input.gif" }]
    const out = await r.run({ input, command: [cmd] })
    if (!out?.length) return null
    const f = out[0]
    const ab = await f.arrayBuffer()
    return new Uint8Array(ab)
  } catch { return null }
}

export async function compressGifToTarget(file: File | Blob, targetKB: number): Promise<CompressResult> {
  const targetBytes = targetKB * 1024
  const buf = new Uint8Array(await (file as File).arrayBuffer())
  if (buf.length <= targetBytes) {
    return { blob: new Blob([buf as unknown as BlobPart], { type: "image/gif" }), size: buf.length, quality: 1, scale: 1, keptOriginal: true }
  }

  const origFps = await getOriginalFps(buf)
  // scales to try — prefer larger first
  const scales = [1, 0.85, 0.7, 0.55, 0.4]
  const fpsTargets = Array.from(new Set([Math.min(origFps, 30), 30, 24, 20, 15, 12, 10].filter(f => f >= 8 && f <= 30).sort((a, b) => b - a)))
  let best: { bytes: Uint8Array; fps: number; scale: number } | null = null

  // lossy 20-60 is balanced per docs; keep 256 colors until last resort
  const lossySteps = [20, 50, 80]

  for (const scale of scales) {
    for (const fps of fpsTargets) {
      const delay = fpsToDelayCs(fps)
      for (const lossy of lossySteps) {
        // cmd: -O3 --lossy --colors --scale --delay -o /out/out.gif
        // must include input name
        const scalePart = scale !== 1 ? ` --scale ${scale}` : ""
        // --delay changes fps; -O3 with --lossy
        const cmd = `-O3 --lossy=${lossy} --colors 256${scalePart} --delay ${delay} input.gif -o /out/out.gif`
        const out = await gifsicleCompress(buf, cmd)
        if (!out) continue
        if (out.length <= targetBytes) {
          if (!best || out.length > best.bytes.length) best = { bytes: out, fps, scale }
          if (out.length >= targetBytes * 0.985) break
        }
      }
      if (best && best.bytes.length >= targetBytes * 0.985) break
    }
    if (best && best.bytes.length >= targetBytes * 0.985) break
    if (best) break
  }

  if (best) {
    const blob = new Blob([best.bytes as unknown as BlobPart], { type: "image/gif" })
    const q = Math.min(1, best.fps / Math.max(1, origFps))
    return { blob, size: blob.size, quality: q, scale: best.scale, keptOriginal: false }
  }

  // last resort: heavy lossy + 128 colors + smallest scale + lowest fps (still color-safe min 128)
  const delay10 = fpsToDelayCs(10)
  const fallbackCmd = `-O3 --lossy=120 --colors 128 --scale 0.4 --delay ${delay10} input.gif -o /out/out.gif`
  const fb = await gifsicleCompress(buf, fallbackCmd)
  if (fb) {
    const blob = new Blob([fb as unknown as BlobPart], { type: "image/gif" })
    return { blob, size: blob.size, quality: 0.1, scale: 0.4, keptOriginal: false }
  }

  // if wasm unavailable/fails: fallback to no compression but report can't reach
  const blob = new Blob([buf as unknown as BlobPart], { type: "image/gif" })
  return { blob, size: blob.size, quality: 0.1, scale: 0.4, keptOriginal: false }
}

// Auto level: lossless optimize only (-O3), keep original when no gain.
export async function compressGifToMinimum(file: File | Blob): Promise<CompressResult> {
  const buf = new Uint8Array(await (file as File).arrayBuffer())
  const out = await gifsicleCompress(buf, `-O3 input.gif -o /out/out.gif`)
  if (out && out.length < buf.length) {
    const blob = new Blob([out as unknown as BlobPart], { type: "image/gif" })
    return { blob, size: blob.size, quality: 1, scale: 1, keptOriginal: false }
  }
  const blob = new Blob([buf as unknown as BlobPart], { type: "image/gif" })
  return { blob, size: blob.size, quality: 1, scale: 1, keptOriginal: true }
}
