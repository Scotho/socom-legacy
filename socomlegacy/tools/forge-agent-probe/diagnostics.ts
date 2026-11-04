/** Product adaptation: fixed diagnostic vocabulary only; raw errors and command output never enter reports. */
export type SetupPhase = 'CLIENT_LOOKUP' | 'CLIENT_PROFILE_LOCATION' | 'CLIENT_PROFILE_CREATE' | 'CLIENT_PROFILE_PERMISSIONS'
  | 'CLIENT_AUTH_SNAPSHOT' | 'CLIENT_CONFIG_WRITE' | 'CLIENT_LAUNCH' | 'CLIENT_PREFLIGHT_LAUNCH' | 'CLIENT_PROFILE_CLEANUP' | 'CLIENT_SETUP';
export type SetupReason = 'INSTALLED_CLIENT_REQUIRED' | 'EXISTING_SUBSCRIPTION_REQUIRED' | 'ACCESS_TOKEN_VALIDITY_REQUIRED'
  | 'PROFILE_LOCATION_UNSAFE' | 'PROFILE_CREATE_FAILED' | 'PROFILE_PERMISSIONS_FAILED' | 'ACCESS_SNAPSHOT_FAILED'
  | 'CLIENT_CONFIG_WRITE_FAILED' | 'CLIENT_LAUNCH_FAILED' | 'CLIENT_PREFLIGHT_LAUNCH_FAILED' | 'CLIENT_PREFLIGHT_NONZERO' | 'PROFILE_CLEANUP_FAILED' | 'CLIENT_SETUP_FAILED';
const OS_CODES = new Set(['EACCES', 'EPERM', 'EBUSY', 'ENOENT', 'EINVAL', 'ENOSPC', 'EMFILE', 'ENFILE', 'ETIMEDOUT']);
export class ClientSetupError extends Error {
  child?: { exitCode: number | null; timedOut: boolean; outputError: boolean };
  constructor(readonly phase: SetupPhase, readonly reason: SetupReason, readonly systemCode?: string) { super(reason); this.name = 'ClientSetupError'; }
}
export async function setupStage<T>(phase: SetupPhase, reason: SetupReason, work: () => Promise<T> | T): Promise<T> {
  try { return await work(); }
  catch (error) { throw setupError(phase, reason, error); }
}
export function setupError(phase: SetupPhase, reason: SetupReason, error: unknown): ClientSetupError {
  if (error instanceof ClientSetupError) return error;
  const known = error instanceof Error && ['INSTALLED_CLIENT_REQUIRED', 'EXISTING_SUBSCRIPTION_REQUIRED', 'ACCESS_TOKEN_VALIDITY_REQUIRED'].includes(error.message)
    ? error.message as SetupReason : reason;
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && OS_CODES.has(error.code) ? error.code : undefined;
  return new ClientSetupError(phase, known, code);
}
export function clientFailureReport(error: unknown) {
  const failure = error instanceof ClientSetupError ? error : new ClientSetupError('CLIENT_SETUP', 'CLIENT_SETUP_FAILED');
  return { status: ['INSTALLED_CLIENT_REQUIRED', 'EXISTING_SUBSCRIPTION_REQUIRED', 'ACCESS_TOKEN_VALIDITY_REQUIRED'].includes(failure.reason) ? 'blocked' as const : 'fail' as const,
    phase: failure.phase, reason: failure.reason, ...(failure.systemCode && OS_CODES.has(failure.systemCode) ? { systemCode: failure.systemCode } : {}),
    ...(failure.child ? { childExit: failure.child.exitCode, timedOut: failure.child.timedOut } : {}) };
}
