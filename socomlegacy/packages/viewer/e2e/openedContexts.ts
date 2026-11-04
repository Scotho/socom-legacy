import type { BrowserContext } from '@playwright/test';

/**
 * Browser-test adaptation (issue #91): the contexts a spec opens on the worker's shared `browser`, closed at each
 * test's end. Playwright closes only its own `context` fixture; a context opened with `browser.newContext()` lives
 * until the browser does -- after a passing test, the rest of the file and the files after it -- and a page left in a
 * match keeps drawing through SwiftShader, its renderer and its share of the GPU process growing the host's memory.
 * A spec registers each context it opens (`add`) and closes them from `test.afterEach(() => opened.closeAll())`, so a
 * failed step closes them too. No page's behaviour changes: the pages close only after the test's own assertions.
 */
export class OpenedContexts {
  private readonly open = new Set<BrowserContext>();

  /** Registers a context to be closed at the test's end; returns it. */
  add(context: BrowserContext): BrowserContext {
    this.open.add(context);
    return context;
  }

  /** Closes every registered context, each once; one that fails to close does not keep the others open. */
  async closeAll(): Promise<void> {
    const contexts = [...this.open];
    this.open.clear();
    await Promise.allSettled(contexts.map((c) => c.close()));
  }
}
