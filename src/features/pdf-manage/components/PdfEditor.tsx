import { useEffect, useRef, useState } from "react"
import { useCompressor } from "../../../stores/CompressorContext"
import { isPdf } from "../../../features/compression/lib/file"
import { compressPdfToMinimum, compressPdfToTarget } from "../../../features/compression/lib/compressPdf"
import { extractPages, getPdfPageCount, mergePages, type PageRef } from "../lib/pdfManage"
import { fmtBytes } from "../../../lib/format"
import { LevelPicker } from "../../../components/ui/Level/LevelPicker"
import { targetBytesFor, type Level } from "../../../types/file"
import "./PdfEditor.css"

export function PdfEditor() {
  const { items, level, setView, addFiles } = useCompressor()
  const pdfItems = items.filter(i => isPdf(i.file))
  const [pages, setPages] = useState<PageRef[]>([])
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState(false)
  const [progress, setProgress] = useState<string>("")
  const [dragId, setDragId] = useState<string | null>(null)
  const [extractProgress, setExtractProgress] = useState<{ done: number; total: number } | null>(null)
  const [merged, setMerged] = useState<{ intactBytes: Uint8Array | null; intactSize: number; compressedBlob: Blob | null; compressedSize: number; targetBytes: number | null; appliedTag: string } | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [showCompress, setShowCompress] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const tmpMapRef = useRef<Map<string, Blob>>(new Map())
  const extractedRef = useRef<Set<string>>(new Set())
  const pdfIdsKey = pdfItems.map(i => i.id).join(",")
  const busy = loading || merging || calcLoading

  // initial extract — streams page-by-page, yields per frame so first thumb <300ms (ponytail: main-thread thumbs, Worker if >50p still laggy)
  // StrictMode-safe: no initedRef guard, effect re-runs on pdfIdsKey but skips already-extracted ids
  useEffect(() => {
    const ac = new AbortController()
    let cancelled = false
    async function init() {
      const fresh = pdfItems.filter(it => !extractedRef.current.has(it.id))
      if (!fresh.length) return
      setLoading(true)
      setProgress(`Reading ${fresh.length} file(s)…`)
      setExtractProgress({ done: 0, total: 1 })
      let totalPages = 0
      try {
        for (let fi = 0; fi < fresh.length; fi++) {
          const it = fresh[fi]
          if (cancelled || ac.signal.aborted) break
          setProgress(`Counting pages ${fi + 1}/${fresh.length} • ${it.file.name}…`)
          try {
            const c = await getPdfPageCount(it.file as File)
            totalPages += c
            if (totalPages > 0) setExtractProgress({ done: 0, total: totalPages })
          } catch { /* ignore per file */ }
        }
      } catch { /* ignore */ }
      if (totalPages > 0) setExtractProgress({ done: 0, total: totalPages })
      else setExtractProgress({ done: 0, total: 1 })
      let done = 0
      for (const it of fresh) {
        if (cancelled || ac.signal.aborted) break
        try {
          await extractPages(it.file as File, it.id, {
            signal: ac.signal,
            onPage: (ref, idx, total) => {
              if (cancelled || ac.signal.aborted) return
              done += 1
              setPages(prev => [...prev, ref])
              setProgress(`Extracting ${idx}/${total} • ${done}${totalPages ? `/${totalPages}` : ""} total • ${ref.fileName}`)
              if (totalPages) setExtractProgress({ done, total: totalPages })
              else setExtractProgress({ done: idx, total })
            },
          })
          if (cancelled || ac.signal.aborted) return
          extractedRef.current.add(it.id)
        } catch { /* ignore per file */ }
      }
      if (!cancelled && !ac.signal.aborted) {
        if (totalPages > 0) setExtractProgress({ done: totalPages, total: totalPages })
        setProgress(done ? `Ready — ${done} pages` : "")
        // linger 100% briefly so user sees completion instead of flash-hide
        setTimeout(() => {
          if (!cancelled && !ac.signal.aborted) {
            setProgress("")
            setExtractProgress(null)
            setLoading(false)
          }
        }, 400)
      } else {
        setProgress("")
        setExtractProgress(null)
        setLoading(false)
      }
    }
    init()
    return () => { cancelled = true; ac.abort() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfIdsKey])

  const removePage = (id: string) => {
    setPages(prev => prev.filter(p => p.id !== id))
    // invalidate merged when pages change
    setMerged(null)
    setShowCompress(false)
  }

  const onDragStart = (id: string) => setDragId(id)
  const onDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault()
    if (!dragId || dragId === overId) return
    setPages(prev => {
      const a = prev.findIndex(p => p.id === dragId)
      const b = prev.findIndex(p => p.id === overId)
      if (a === -1 || b === -1) return prev
      const next = [...prev]
      const [mv] = next.splice(a, 1)
      next.splice(b, 0, mv)
      return next
    })
  }

  const onDropEnd = () => {
    setDragId(null)
    if (merged) {
      setMerged(null)
      setShowCompress(false)
    }
  }

  const handleAddFiles = async (files: FileList | null) => {
    if (!files) return
    if (loading || merging || calcLoading) return
    const arr = Array.from(files).filter(f => isPdf(f))
    if (!arr.length) {
      setProgress("No PDFs selected — only .pdf files")
      return
    }
    addFiles(arr)
    const ac = new AbortController()
    setLoading(true)
    setProgress(`Reading ${arr.length} file(s)…`)
    setExtractProgress({ done: 0, total: 1 })
    // pre-compress removed — merge raw pages, compress once in doRecompress
    let addTotal = 0
    for (let fi = 0; fi < arr.length; fi++) {
      const f = arr[fi]
      if (ac.signal.aborted) break
      setProgress(`Counting pages ${fi + 1}/${arr.length} • ${f.name}…`)
      try { addTotal += await getPdfPageCount(f) } catch { /* ignore */ }
    }
    let addDone = 0
    if (addTotal) setExtractProgress({ done: 0, total: addTotal })
    else setExtractProgress({ done: 0, total: 1 })
    // ponytail: merge raw pages, compress once in doRecompress — pre-compressing each file doubled the work
    for (const f of arr) {
      if (ac.signal.aborted) break
      const tmpId = Math.random().toString(36).slice(2, 9)
      const sourceBlob: Blob = f
      // ensure File with name for pdfManage
      const fileForExtract = sourceBlob instanceof File ? sourceBlob : new File([sourceBlob as BlobPart], f.name, { type: "application/pdf" })
      tmpMapRef.current.set(tmpId, sourceBlob)
      try {
        await extractPages(fileForExtract, tmpId, {
          signal: ac.signal,
          onPage: (ref, idx, total) => {
            if (ac.signal.aborted) return
            addDone += 1
            setPages(prev => [...prev, ref])
            setProgress(`Extracting ${idx}/${total} • ${addDone}${addTotal ? `/${addTotal}` : ""} • ${ref.fileName}`)
            if (addTotal) setExtractProgress({ done: addDone, total: addTotal })
          },
        })
      } catch { /* ignore */ }
    }
    if (addTotal > 0) setExtractProgress({ done: addTotal, total: addTotal })
    setProgress(addDone ? `Ready — ${addDone} pages added` : "")
    setTimeout(() => {
      setProgress("")
      setExtractProgress(null)
      setLoading(false)
    }, 400)
    setMerged(null)
    setShowCompress(false)
  }

  const tmpMap = tmpMapRef.current

  // Merge pages in current order + auto-calculate total size so user sees it and decides: compress or download intact
  const doMerge = async (): Promise<Uint8Array | null> => {
    if (!pages.length || calcLoading || merging || loading) return null
    setCalcLoading(true)
    setProgress("Merging pages…")
    setExtractProgress({ done: 0, total: Math.max(1, pages.length) })
    try {
      const sourceMap = new Map<string, File | Blob>()
      for (const it of items) sourceMap.set(it.id, it.outBlob ?? it.file)
      for (const [k, v] of tmpMap) sourceMap.set(k, v)
      const intactBytes = await mergePages(pages, sourceMap)
      const intactSize = intactBytes.length
      setMerged({ intactBytes, intactSize, compressedBlob: null, compressedSize: 0, targetBytes: null, appliedTag: "Auto" })
      setProgress(`Merged ${fmtBytes(intactSize)} • ${pages.length} pages • compress or download intact`)
      setExtractProgress({ done: pages.length, total: pages.length })
      // linger 100% before hiding so bar doesn't flash-hide (ponytail: keep flag until timeout)
      setTimeout(() => {
        setExtractProgress(null)
        setCalcLoading(false)
      }, 800)
      return intactBytes
    } catch (e) {
      setProgress(e instanceof Error ? e.message : "merge failed")
      setExtractProgress(null)
      setCalcLoading(false)
      return null
    }
  }

  // levelOverride avoids stale closure when called straight from picker Confirm
  const doRecompress = async (levelOverride?: Level) => {
    const lv = levelOverride ?? level
    if (!merged?.intactBytes || merging || loading || calcLoading) return
    const tb = targetBytesFor(merged.intactSize, lv)
    const tag = lv.kind === "auto" ? "smallest readable" : lv.kind === "percent" ? `${lv.percent}% (≤ ${fmtBytes(tb ?? merged.intactSize)})` : `≤ ${fmtBytes(tb ?? merged.intactSize)}`
    setMerging(true)
    setProgress(`Compressing to ${tag}…`)
    setExtractProgress({ done: 0, total: Math.max(1, pages.length) })
    try {
      const mergedFile = new File([merged.intactBytes as unknown as BlobPart], `merged-${pages.length}p.pdf`, { type: "application/pdf" })
      const onP = (d: number, t: number) => {
        setProgress(`${d}/${t} pages`)
        setExtractProgress({ done: d, total: Math.max(1, t) })
      }
      const res = tb === null
        ? await compressPdfToMinimum(mergedFile, onP)
        : await compressPdfToTarget(mergedFile, tb / 1024, onP)
      setMerged(prev => prev ? { ...prev, compressedBlob: res.blob, compressedSize: res.blob.size, targetBytes: tb, appliedTag: lv.kind === "auto" ? "auto" : lv.kind === "percent" ? `${lv.percent}pct` : `${lv.customKB}kb` } : null)
      setProgress(`Done ${fmtBytes(res.blob.size)}${res.keptOriginal ? " (kept, already ≤ target)" : ""}${res.belowReadableFloor && tb !== null ? ` — can't reach ${fmtBytes(tb)} readably, minimum readable is ${fmtBytes(res.blob.size)}` : ""} • intact was ${fmtBytes(merged.intactSize)}`)
      setExtractProgress({ done: pages.length, total: pages.length })
      setTimeout(() => {
        setExtractProgress(null)
        setMerging(false)
      }, 800)
    } catch (e) {
      setProgress(e instanceof Error ? e.message : "re-compress failed")
      setExtractProgress(null)
      setMerging(false)
    }
  }

  const downloadIntact = () => {
    if (!merged?.intactBytes) return
    const blob = new Blob([merged.intactBytes as unknown as BlobPart], { type: "application/pdf" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `merged-${pages.length}p__intact-${fmtBytes(merged.intactSize).replace(/\s/g, "")}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  const downloadCompressed = () => {
    if (!merged?.compressedBlob) return
    const url = URL.createObjectURL(merged.compressedBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = `merged-${pages.length}p__${merged?.appliedTag ?? "auto"}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  // Download intact is never disabled when pages exist: if not yet merged, merge first then download directly from result
  const downloadIntactOnDemand = async () => {
    if (busy || !pages.length) return
    if (merged?.intactBytes) {
      downloadIntact()
      return
    }
    const intactBytes = await doMerge()
    if (!intactBytes) return
    const blob = new Blob([intactBytes as unknown as BlobPart], { type: "application/pdf" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `merged-${pages.length}p__intact-${fmtBytes(intactBytes.length).replace(/\s/g, "")}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  // Auto-merge when pages settle so Merge button is unnecessary: only Download + Compress stay visible
  // ponytail: debounce 600ms, skip while dragging/extracting/merging
  const pagesKey = pages.map(p => p.id).join(",")
  useEffect(() => {
    if (!pages.length || busy || dragId) return
    if (merged?.intactBytes) return
    const t = setTimeout(() => {
      void doMerge()
    }, 600)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesKey, busy, dragId])

  if (!pdfItems.length && !pages.length && !loading) {
    return (
      <div className="pdf-editor" aria-busy={busy}>
        <div className="pdf-editor__top">
          <div className="pdf-editor__title">PDF Editor</div>
          <button className="btn btn-ghost" onClick={() => setView("compress")}>← Back</button>
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>No PDFs found. Add PDFs to start editing.</div>
        {progress && <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 8 }}>{progress}</div>}
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => fileRef.current?.click()}>Add PDFs</button>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" multiple hidden onChange={e => { handleAddFiles(e.target.files); if (e.target) e.target.value = "" }} />
        </div>
      </div>
    )
  }

  return (
    <div className="pdf-editor" aria-busy={busy}>
      <div className="pdf-editor__top">
        <div>
          <div className="pdf-editor__title">PDF Editor</div>
          <div className="pdf-editor__hint">
            {pages.length} pages • drag to reorder • remove pages • add more PDFs • {level.kind === "auto" ? "Auto smallest readable" : level.kind === "percent" ? `${level.percent}% of merged size` : `target ≤ ${fmtBytes(level.customKB * 1024)}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => setView("compress")} disabled={merging || calcLoading}>← Back</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={merging || loading || calcLoading}>Add PDFs</button>
        </div>
      </div>

      <div className="pdf-editor__drop">
        <span>{loading ? (progress || "Loading pages…") : `${pages.length} pages ready — drag to reorder`}</span>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>{pdfItems.length} source file{pdfItems.length !== 1 ? "s" : ""}{tmpMap.size ? ` + ${tmpMap.size} added` : ""}</span>
      </div>

      {/* Top bar owns extraction only — merge/compress progress lives in the bottom section */}
      {loading && extractProgress && extractProgress.total > 0 && (
        <div className="pdf-editor__bar" role="progressbar" aria-valuenow={Math.round((extractProgress.done / extractProgress.total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Extracting PDF pages">
          <i style={{ width: `${Math.min(100, Math.round((extractProgress.done / extractProgress.total) * 100))}%` }} />
        </div>
      )}
      {loading && (!extractProgress || extractProgress.total <= 0) && (
        <div className="pdf-editor__bar pdf-editor__bar--indeterminate" role="progressbar" aria-label="Extracting PDF pages"><i /></div>
      )}
      {loading && extractProgress && extractProgress.total > 0 && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
          <span>{extractProgress.done} / {extractProgress.total} pages</span>
          <span>{Math.round((extractProgress.done / extractProgress.total) * 100)}%</span>
        </div>
      )}
      {loading && (!extractProgress || extractProgress.total <= 0) && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
          <span>{progress || "Working…"}</span>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".pdf,application/pdf" multiple hidden onChange={e => { handleAddFiles(e.target.files); if (e.target) e.target.value = "" }} />

      {!pages.length && loading ? <div style={{ color: "var(--muted)", fontSize: 13, padding: 16 }}>{progress || "Extracting pages…"}</div> : (
        <div className="pdf-editor__grid">
          {pages.map(p => (
            <div
              key={p.id}
              className={`pdf-page ${dragId === p.id ? "dragging" : ""}`}
              draggable
              onDragStart={() => onDragStart(p.id)}
              onDragOver={e => onDragOver(e, p.id)}
              onDragEnd={onDropEnd}
            >
              <div className="pdf-page__thumb">
                <img src={p.thumb} alt={`${p.fileName} p${p.sourcePageIdx}`} draggable={false} />
              </div>
              <div className="pdf-page__meta">
                <b title={p.fileName}>{p.fileName}</b>
                <span>p{p.sourcePageIdx}</span>
              </div>
              <div className="pdf-page__actions">
                <button className="btn btn-ghost" onClick={() => removePage(p.id)} disabled={merging || calcLoading}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!!pages.length && (
        <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center", marginRight: "auto" }}>{progress && (merging || calcLoading) ? progress : merged?.intactBytes ? (merged.compressedBlob ? `Total ${fmtBytes(merged.intactSize)} → ${fmtBytes(merged.compressedSize)} • ${pages.length} pages` : `Total ${fmtBytes(merged.intactSize)} • ${pages.length} pages`) : `${pages.length} pages • merging…`}</span>
          <button className="btn btn-ghost" onClick={() => setView("compress")} disabled={merging || calcLoading}>Cancel</button>
          {!merged?.compressedBlob && <button className="btn btn-ghost" onClick={downloadIntactOnDemand} disabled={!pages.length || busy}>Download intact</button>}
          {!showCompress ? (
            merged?.compressedBlob ? (
              <button className="btn" onClick={downloadCompressed}>Download compressed</button>
            ) : (
              <button className="btn" onClick={() => setShowCompress(true)} disabled={busy}>Compress</button>
            )
          ) : (
            <button className="btn btn-ghost" onClick={() => { setShowCompress(false); setMerged(null); }} disabled={merging} title="Close and discard compression result" aria-label="Close and discard compression result">✕</button>
          )}
        </div>
      )}

      {/* Level picker below the buttons — appears only when user clicks Compress; Confirm starts compression */}
      {showCompress && pages.length > 0 && (
        <div style={{ margin: "12px 0 0", border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Level for merged PDF (adjust, then press Confirm to start compressing):</div>
          <LevelPicker onConfirm={(v) => doRecompress(v)} disabled={loading || merging || calcLoading} />
        </div>
      )}

      {/* Bottom section owns merge + compress progress and the result — the only place compression progress shows */}
      {(calcLoading || merging || merged?.compressedBlob) && (
        <div style={{ margin: "12px 0 0", border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "#fff" }} aria-live="polite">
          {(merging || (calcLoading && !merged?.compressedBlob)) ? (
            <>
              <div style={{ fontSize: 13, marginBottom: 8 }}>{progress || (merging ? "Compressing merged PDF…" : "Merging pages…")}</div>
              {extractProgress && extractProgress.total > 0 ? (
                <>
                  <div className="pdf-editor__bar" role="progressbar" aria-valuenow={Math.round((extractProgress.done / extractProgress.total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={calcLoading ? "Merging pages" : "Compressing merged PDF"}>
                    <i style={{ width: `${Math.min(100, Math.round((extractProgress.done / extractProgress.total) * 100))}%` }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
                    <span>{extractProgress.done} / {extractProgress.total} pages</span>
                    <span>{Math.round((extractProgress.done / extractProgress.total) * 100)}%</span>
                  </div>
                </>
              ) : (
                <div className="pdf-editor__bar pdf-editor__bar--indeterminate" role="progressbar" aria-label={calcLoading ? "Merging pages" : "Compressing merged PDF"}><i /></div>
              )}
            </>
          ) : merged?.compressedBlob ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13 }}>
                <div><b>Ready:</b> {fmtBytes(merged.compressedSize)} • {pages.length} pages (intact was {fmtBytes(merged.intactSize)}){merged.targetBytes !== null && merged.compressedSize > merged.targetBytes && <span style={{ color: "var(--accent)" }}> • over target — minimum readable, raise level or keep intact</span>}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{progress}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-ghost" onClick={downloadIntactOnDemand} disabled={!pages.length || busy}>Download intact</button>
                <button className="btn" onClick={downloadCompressed}>Download</button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
