declare module "gifsicle-wasm-browser" {
  const g: { run: (o: { input: { file: Uint8Array | File | Blob | string; name: string }[]; command: string[] }) => Promise<File[]>; tool: unknown }
  export default g
}
declare module "gifuct-js" {
  export function parseGIF(a: Uint8Array): unknown
  export function decompressFrames(a: unknown, buildPatch: boolean): { delay: number }[]
}
