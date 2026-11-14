import { test, expect } from '@playwright/test';

/** Actual browser workers, synthetic transferred assets. This is lifecycle coverage, not a live-map/Xbox memory test. */
test('Xbox mission replacement terminates real workers and subsequent loads stay bounded', async ({ page }) => {
  await page.route(/\/__load-ownership(?:\?|$)/, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/__load-ownership?renderer=xbox');
  const result = await page.evaluate(async () => {
    const path = '/src/matchMount.ts';
    const { matchLoader } = await import(/* @vite-ignore */ path) as typeof import('../src/matchMount');
    const workerUrl = URL.createObjectURL(new Blob([`
      self.onmessage = ({ data: r }) => {
        if (r.hold) return;
        if (r.fail) { self.postMessage({kind:'error', id:r.id, doing:'load', message:'synthetic failure'}); return; }
        if (r.kind === 'load') {
          const pixels = new Uint8Array(2 * 1024 * 1024);
          self.postMessage({kind:'map', id:r.id, map:{path:r.path, archive:r.path, testPixels:pixels}}, [pixels.buffer]);
        } else if (r.kind === 'play') self.postMessage({kind:'play', id:r.id, data:null});
        else if (r.kind === 'effects') self.postMessage({kind:'effects', id:r.id, data:null});
        else if (r.kind === 'sound') {
          self.postMessage({kind:'sound', id:r.id, data:{banks:[]}});
          self.postMessage({kind:'soundLoops', id:r.id, loops:[]});
        }
      };
    `], { type: 'text/javascript' }));
    const active = new Set<Worker>();
    let peak = 0, created = 0, terminated = 0, firstPlay = true, failMap = false;
    let playStarted = () => {};
    const paused = new Promise<void>(resolve => { playStarted = resolve; });
    const loader = matchLoader({ kind: 'http', baseUrl: '/unused' }, () => {
      const own = new Worker(workerUrl); active.add(own); created++; peak = Math.max(peak, active.size);
      return {
        postMessage: request => {
          const hold = firstPlay && request.kind === 'play', fail = failMap && request.kind === 'load';
          if (hold) { firstPlay = false; playStarted(); }
          if (fail) failMap = false;
          own.postMessage({ ...request, hold, fail });
        },
        addEventListener: ((kind: string, listener: EventListener) => own.addEventListener(kind, listener)) as import('../src/matchMount').MatchWorker['addEventListener'],
        terminate: () => { if (active.delete(own)) { own.terminate(); terminated++; } },
      };
    });
    try {
      const obsolete = loader.load('mp2');
      await paused; // Map already transferred; its animation decoder remains active when replaced.
      const replacement = loader.load('mp3');
      const cancelled = await obsolete === null;
      const loaded = await replacement;
      const maps = [loaded?.map.path];
      for (const mission of ['mp6', 'mp2', 'mp3']) maps.push((await loader.load(mission))?.map.path);
      failMap = true;
      const beforeFailure = created, failed = await loader.load('mp6') === null;
      await loader.prepare('mp6');
      const failureWorkers = created - beforeFailure;
      const retry = (await loader.load('mp6'))?.map.path;
      return { cancelled, maps, failed, failureWorkers, retry, peak, active: active.size, created, terminated };
    } finally {
      loader.dispose();
      for (const own of active) own.terminate();
      active.clear(); URL.revokeObjectURL(workerUrl);
    }
  });
  expect(result.cancelled).toBe(true);
  expect(result.maps).toEqual(['RUN/MP3.ZDB', 'RUN/MP6.ZDB', 'RUN/MP2.ZDB', 'RUN/MP3.ZDB']);
  expect(result.failed).toBe(true);
  expect(result.failureWorkers).toBe(1);
  expect(result.retry).toBe('RUN/MP6.ZDB');
  expect(result.peak).toBe(1);
  expect(result.active).toBe(0);
  expect(result.created).toBe(result.terminated);
});
