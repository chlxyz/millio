import { CompressorProvider, useCompressor } from "./stores/CompressorContext"
import { Header } from "./components/layout/Header/Header"
import { Hero } from "./components/layout/Hero/Hero"
import { Footer } from "./components/layout/Footer/Footer"
import { LevelPicker } from "./components/ui/Level/LevelPicker"
import { ErrorBoundary } from "./components/layout/ErrorBoundary"
import { DropZone } from "./components/files/DropZone/DropZone"
import { FileGrid } from "./components/files/FileGrid/FileGrid"
import { ActionBar } from "./components/files/ActionBar/ActionBar"
import { PdfEditor } from "./features/pdf-manage/components/PdfEditor"
import { useThumbs } from "./features/compression/hooks/useThumbs"
import { useCompression } from "./features/compression/hooks/useCompression"
import { fmtBytes, pctSaved } from "./lib/format"
import { useEffect, useMemo } from "react"

function CompressorApp() {
  useThumbs()
  useCompression()
  const { items, level, view } = useCompressor()

  // ponytail: a drop that misses the zone must never navigate the tab away (blank white page)
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    window.addEventListener("dragover", stop)
    window.addEventListener("drop", stop)
    return () => {
      window.removeEventListener("dragover", stop)
      window.removeEventListener("drop", stop)
    }
  }, [])

  const sum = useMemo(() => {
    const totalOrig = items.reduce((a, b) => a + b.originalSize, 0)
    const totalOut = items.reduce((a, b) => a + (b.outSize ?? b.originalSize), 0)
    const ready = items.filter(i => i.status === "done" || i.status === "kept").length
    return { totalOrig, totalOut, ready, count: items.length }
  }, [items])
  const isCompressing = items.some(i => i.status === "queued" || i.status === "compressing")
  const pendingCount = items.filter(i => i.status === "pending").length
  const pct = sum.count ? Math.round((sum.ready / sum.count) * 100) : 0
  const compressingCount = items.filter(i => i.status === "compressing").length
  const queuedCount = items.filter(i => i.status === "queued").length

  if (view === "pdf-edit") {
    return (
      <div>
        <Header />
        <PdfEditor />
        <div className="wrap"><Footer /></div>
      </div>
    )
  }

  return (
    <div>
      <Header />
      <Hero />
      <div className="wrap">
        <DropZone isCompressing={isCompressing} />
        {sum.count > 0 && (
          <div className="empty-hint">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent)", display: "inline-block" }} />
            {pendingCount > 0 ? `${pendingCount} waiting for Confirm • ` : `${sum.ready} / ${sum.count} ready • `}{fmtBytes(sum.totalOrig)} → {fmtBytes(sum.totalOut)} {sum.totalOrig > sum.totalOut ? `• −${pctSaved(sum.totalOrig, sum.totalOut)}%` : ""} • {level.kind === "auto" ? "auto smallest readable" : level.kind === "percent" ? `${level.percent}% of original` : `honest precise (≤ ${fmtBytes(level.customKB * 1024)})`}
          </div>
        )}
        {isCompressing && sum.count > 0 && (
          <>
            <div className="global-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Compressing files">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="spinner" aria-hidden /><span>{compressingCount ? `Compressing ${compressingCount}` : "Queued"} • {queuedCount ? `${queuedCount} queued • ` : ""}{sum.ready}/{sum.count} ready</span></span>
              <span><b style={{ color: "var(--ink)" }}>{pct}%</b> • {sum.ready}/{sum.count}</span>
            </div>
          </>
        )}
        {isCompressing && sum.count === 0 && (
          <div className="global-bar global-bar--indet" aria-label="Loading"><i /></div>
        )}
        <FileGrid />
        {sum.count > 0 && <LevelPicker />}
        <ActionBar />
        <Footer />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <CompressorProvider>
      <ErrorBoundary>
        <CompressorApp />
      </ErrorBoundary>
    </CompressorProvider>
  )
}
