import { expect, it, vi } from 'vitest';
import type { BrowserContext } from '@playwright/test';
import { OpenedContexts } from '../e2e/openedContexts';

const fakeContext = () => ({ close: vi.fn().mockResolvedValue(undefined) });

it('closes every context it was given, each exactly once (issue #91)', async () => {
  const a = fakeContext(), b = fakeContext();
  const opened = new OpenedContexts();
  expect(opened.add(a as unknown as BrowserContext)).toBe(a);
  opened.add(b as unknown as BrowserContext);
  opened.add(b as unknown as BrowserContext);
  await opened.closeAll();
  await opened.closeAll();
  expect(a.close).toHaveBeenCalledTimes(1);
  expect(b.close).toHaveBeenCalledTimes(1);
});

it('a context that fails to close does not keep the others open', async () => {
  const a = fakeContext(), b = fakeContext();
  a.close.mockRejectedValueOnce(Error('already gone'));
  const opened = new OpenedContexts();
  opened.add(a as unknown as BrowserContext);
  opened.add(b as unknown as BrowserContext);
  await expect(opened.closeAll()).resolves.toBeUndefined();
  expect(b.close).toHaveBeenCalledTimes(1);
});
