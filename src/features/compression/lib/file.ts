export function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}
export function isGif(file: File | Blob) {
  const f = file as File
  return (f.type === "image/gif") || !!(f.name && f.name.toLowerCase().endsWith(".gif"))
}
export function isImage(file: File) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(file.name)
}
export function isStaticImage(file: File) {
  return file.type.startsWith("image/") && !isGif(file) || /\.(jpe?g|png|webp)$/i.test(file.name)
}
