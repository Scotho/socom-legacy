import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { e2eRenderer } from './renderer';

/**
 * OVERLAY-CONSOLE fold 2 (a browser-test adaptation: no page's behaviour changes): the pages of the modern specs' cases
 * that give the console its disc image, each in a **persistent Chromium profile of its own**, a temporary directory
 * deleted once its browser is closed -- DX-3's own specs' pattern (`./discExtract.spec.ts`, `./inviteStart.spec.ts`).
 *
 * Why not the worker's `browser.newContext()`: since DX-3 the console extracts the disc's read set into the origin's
 * storage at the pick (`../src/discExtract` `extractDisc`), and checks the room first -- what is left to store plus
 * `DISC_COPY_MARGIN` (256 MiB, `../src/discCopy`) against the storage's `estimate()`. A context Playwright opens on its
 * browser is off the record, and its storage quota is a share of the host's memory, which the margin alone can exceed
 * (the front-end plan's Log, DX-3: "the default context's quota would refuse a gigabyte"); a profile on disk has the
 * drive's quota. The small image (`./fixtureImage`) asks for its few megabytes and the same margin.
 *
 * As `./openedContexts` does for contexts (issue #117): a spec makes one `DiscProfiles`, takes each case's page from
 * `page`, and closes them all from `test.afterEach(() => profiles.closeAll())`, so a failed step closes the browser and
 * removes its directory too; each directory is removed in a `finally`, after its browser is closed. The launch takes the
 * run's renderer and Chromium as `playwright.config.ts`'s `launchOptions` give them.
 */
export class DiscProfiles {
  private readonly open: { context: BrowserContext; dir: string }[] = [];

  /** A page in a fresh persistent profile, at `baseURL`, `viewport` (1280x720 by default). */
  async page(baseURL: string | undefined, viewport: { width: number; height: number } = { width: 1280, height: 720 }): Promise<Page> {
    const dir = mkdtempSync(join(tmpdir(), 's2u-mu2-disc-'));
    const context = await chromium.launchPersistentContext(dir, {
      ...(baseURL ? { baseURL } : {}), viewport,
      args: e2eRenderer(process.env.S2U_E2E_RENDERER).args, executablePath: process.env.PW_CHROMIUM || undefined,
    }).catch((e: unknown) => {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      throw e;
    });
    this.open.push({ context, dir });
    return context.pages()[0] ?? await context.newPage();
  }

  /** Closes every profile's browser, each once, then removes its directory; one that fails does not keep the others. */
  async closeAll(): Promise<void> {
    const open = this.open.splice(0);
    await Promise.allSettled(open.map(async ({ context, dir }) => {
      try {
        await context.close();
      } finally {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
    }));
  }
}
