/** Test-only substitution: identical raw submission with clip-volume rejection disabled. */
export function frameVisibility() {
  return { frame() {}, visible() { return true; } };
}
