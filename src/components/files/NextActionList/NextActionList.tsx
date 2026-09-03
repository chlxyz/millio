import { useMemo } from "react"
import { useCompressor } from "../../../stores/CompressorContext"

const NextActionList = () => {
    const { items } = useCompressor();

    void useMemo(() => {
        const totalOrig = items.reduce((a, b) => a + b.originalSize, 0)
        const totalOut = items.reduce((a, b) => a + (b.outSize ?? b.originalSize), 0)
        const ready = items.filter(i => i.status === "done" || i.status === "kept").length
        return { totalOrig, totalOut, ready, count: items.length }
    }, [items]);

    if (!items.length) return null;

    return (
        <div className="next-action-list">
            {/* < */}
        </div>  
    )
};

export default NextActionList;