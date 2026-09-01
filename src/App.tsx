import { CompressorProvider, useCompressor } from "./stores/CompressorContext"
import { Header } from "./components/layout/Header/Header"
import { Hero } from "./components/layout/Hero/Hero"
import { Footer } from "./components/layout/Footer/Footer"
import { SizeSlider } from "./components/ui/Slider/SizeSlider"
import { DropZone } from "./components/files/DropZone/DropZone"
import { FileGrid } from "./components/files/FileGrid/FileGrid"
import { ActionBar } from "./components/files/ActionBar/ActionBar"
import { useThumbs } from "./features/compression/hooks/useThumbs"
import { useCompression } from "./features/compression/hooks/useCompression"
import { fmtBytes, pctSaved } from "./lib/format"
import { useMemo } from "react"

function CompressorApp() {
  useThumbs()
  useCompression()
  const { items, targetKB } = useCompressor()

  const sum = useMemo(() => {
    const totalOrig = items.reduce((a, b) => a + b.originalSize, 0)
    const totalOut = items.reduce((a, b) => a + (b.outSize ?? b.originalSize), 0)
    const ready = items.filter(i => i.status === "done" || i.status === "kept").length
    return { totalOrig, totalOut, ready, count: items.length }
  }, [items])

  return (
    <div>
      <Header />
      <Hero />
      <div className="wrap">
        <DropZone />
        <SizeSlider />
        {sum.count > 0 && (
          <div className="empty-hint">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent)", display: "inline-block" }} />
            {sum.ready} / {sum.count} ready • {fmtBytes(sum.totalOrig)} → {fmtBytes(sum.totalOut)} {sum.totalOrig > sum.totalOut ? `• −${pctSaved(sum.totalOrig, sum.totalOut)}%` : ""} • honest precise (≤ {targetKB} KB)
          </div>
        )}
        <FileGrid />
        <ActionBar />
        <Footer />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <CompressorProvider>
      <CompressorApp />
    </CompressorProvider>
  )
}
