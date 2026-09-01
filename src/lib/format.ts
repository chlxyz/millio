export function fmtKB(bytes: number) {
  return `${(bytes / 1024).toFixed(bytes >= 1024 * 1024 ? 1 : 0)} KB`;
}
export function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
export function pctSaved(orig: number, comp: number) {
  if (comp >= orig) return 0;
  return Math.round((1 - comp / orig) * 100);
}
