import { useCompressor } from "../../../stores/CompressorContext"
import { FileCard } from "../FileCard/FileCard"
import "./FileGrid.css"

export function FileGrid() {
  const { items } = useCompressor()
  if (!items.length) return null
  return (
    <div className="grid">
      {items.map(it => <FileCard key={it.id} item={it} />)}
    </div>
  )
}
