/** Browser-test scheduling only; never a gameplay clock or a console memory claim. */
export function xboxSessionPlan(soakValue: string | undefined) {
  const soakSeconds = soakValue === undefined ? 30 : Number(soakValue);
  if (!Number.isInteger(soakSeconds) || soakSeconds < 30 || soakSeconds > 900) {
    throw new Error('XBOX_SOAK_SECONDS must be an integer from 30 through 900');
  }
  const timeoutMs = 210_000 + soakSeconds * 1000;
  // The owned job has its own deadline after Playwright's, even if CDP stalls.
  const jobSeconds = timeoutMs / 1000 + 60;
  return { soakSeconds, timeoutMs, jobSeconds, memorySamples: jobSeconds + 10 };
}
