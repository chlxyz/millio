export type CompressResult = {
  blob: Blob
  size: number
  quality: number
  scale: number
  keptOriginal: boolean
  // set when target can't be hit without dropping below readable raster floors —
  // output is the smallest readable attempt, still over target
  belowReadableFloor?: boolean
  // set when the original was kept because any readable attempt would enlarge it
  alreadyEfficient?: boolean
  // set when text/vectors are untouched (lossless re-save, image downsample) — stays selectable
  vectorSafe?: boolean
}
