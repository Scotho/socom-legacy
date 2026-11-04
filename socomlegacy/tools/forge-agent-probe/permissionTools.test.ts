import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIsolatedProfile } from './isolation';

// Product adaptation: no permission helper runs. The executor records the exact Windows binary selected.
const control = vi.hoisted(() => ({
  calls: [] as { file: string; args: string[]; hidden: boolean }[],
  identity: '"fixture","S-1-5-21-1000"',
}));
vi.mock('node:child_process', async original => {
  const actual = await original<typeof import('node:child_process')>();
  const { promisify } = await import('node:util');
  const fake = Object.assign(vi.fn(), {
    [promisify.custom]: async (file: string, args: string[], options: { windowsHide?: boolean }) => {
      control.calls.push({ file, args: [...args], hidden: options.windowsHide === true });
      return { stdout: file.endsWith('whoami.exe') ? control.identity : '', stderr: '' };
    },
  });
  return { ...actual, execFile: fake };
});

describe.skipIf(process.platform !== 'win32')('isolated Windows profile permission tools', () => {
  beforeEach(() => { control.calls.length = 0; control.identity = '"fixture","S-1-5-21-1000"'; });

  it('selects System32 tools directly even when the shell PATH can contain Git coreutils', async () => {
    await withIsolatedProfile(async () => {});
    const system = join(process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows', 'System32');
    expect(control.calls.map(call => call.file)).toEqual([join(system, 'whoami.exe'), join(system, 'icacls.exe')]);
    expect(control.calls.every(call => call.hidden)).toBe(true);
    expect(control.calls[0]!.args).toEqual(['/user', '/fo', 'csv', '/nh']);
    expect(control.calls[1]!.args.slice(1)).toEqual(['/inheritance:r', '/grant:r', '*S-1-5-21-1000:(OI)(CI)F']);
  });

  it('refuses before applying ACLs or running the profile callback if the identity has no SID', async () => {
    control.identity = 'no Windows identity';
    const work = vi.fn(async () => {});
    await expect(withIsolatedProfile(work)).rejects.toMatchObject({
      phase: 'CLIENT_PROFILE_PERMISSIONS', reason: 'PROFILE_PERMISSIONS_FAILED',
    });
    expect(work).not.toHaveBeenCalled();
    expect(control.calls).toHaveLength(1);
  });
});
