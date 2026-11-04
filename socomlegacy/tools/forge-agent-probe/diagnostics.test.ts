import { expect, it } from 'vitest';
import { ClientSetupError, clientFailureReport, setupStage } from './diagnostics';
import { launchChild } from './client';
import { withIsolatedProfile } from './isolation';
import { join } from 'node:path';

it('reports a fixed failed stage and allowlisted OS code without copying raw diagnostics', async () => {
  const original = Object.assign(Error('synthetic-sensitive-diagnostic'), { code: 'EPERM', stdout: 'synthetic-output', stderr: 'synthetic-error' });
  let observed: unknown;
  try { await setupStage('CLIENT_PROFILE_CLEANUP', 'PROFILE_CLEANUP_FAILED', async () => { throw original; }); } catch (error) { observed = error; }
  expect(observed).toBeInstanceOf(ClientSetupError);
  const report = clientFailureReport(observed);
  expect(report).toEqual({ status: 'fail', phase: 'CLIENT_PROFILE_CLEANUP', reason: 'PROFILE_CLEANUP_FAILED', systemCode: 'EPERM' });
  expect(JSON.stringify(report)).not.toMatch(/sensitive|synthetic-output|synthetic-error/);
});
it('does not preserve arbitrary error codes or falsely turn launch failures into prerequisites', async () => {
  let observed: unknown;
  try { await setupStage('CLIENT_LAUNCH', 'CLIENT_LAUNCH_FAILED', async () => { throw { code: 'synthetic-sensitive-code' }; }); } catch (error) { observed = error; }
  expect(clientFailureReport(observed)).toEqual({ status: 'fail', phase: 'CLIENT_LAUNCH', reason: 'CLIENT_LAUNCH_FAILED' });
  expect(clientFailureReport(new ClientSetupError('CLIENT_AUTH_SNAPSHOT', 'ACCESS_TOKEN_VALIDITY_REQUIRED')).status).toBe('blocked');
});
it('retains safe child exit data when cleanup fails after execution', () => {
  const failure = new ClientSetupError('CLIENT_PROFILE_CLEANUP', 'PROFILE_CLEANUP_FAILED', 'EBUSY');
  failure.child = { exitCode: 9, timedOut: false, outputError: true };
  expect(clientFailureReport(failure)).toMatchObject({ status: 'fail', childExit: 9, timedOut: false, phase: 'CLIENT_PROFILE_CLEANUP' });
});
it('identifies an actual failed process launch with its safe OS code', async () => {
  await withIsolatedProfile(async directory => {
    let observed: unknown;
    try { await launchChild({ executable: join(directory, 'missing-executable'), args: [], directory, env: {}, prompt: '', timeoutMs: 1000 }); }
    catch (error) { observed = error; }
    expect(clientFailureReport(observed)).toEqual({ status: 'fail', phase: 'CLIENT_LAUNCH', reason: 'CLIENT_LAUNCH_FAILED', systemCode: 'ENOENT' });
  });
});
