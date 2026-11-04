import { expect, test } from '@playwright/test';

test('flash duck changes live world voices and sends while exempt groups stay audible', async ({ page }, info) => {
  await page.route('**/__flash-audio', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/__flash-audio');
  const rows = await page.evaluate(async () => {
    const path = '/e2e/flashAudioScene.ts';
    const scene: typeof import('./flashAudioScene') = await import(/* @vite-ignore */ path);
    return scene.measureFlashAudio();
  });
  await info.attach('actual-mixer-levels', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
  for (const row of rows) {
    if (row.late) expect(Math.abs(row.base)).toBeLessThan(0.00001);
    else expect(row.base, `${row.kind}/${row.group}: audible`).toBeGreaterThan(0.09);
    const affected = [0, 1, 2, 3, 5, 6].includes(row.group);
    expect(row.hold, `${row.kind}/${row.group}/late=${row.late}: hold`).toBeCloseTo(affected ? (358 / 1024) ** 2 : 1, 4);
    expect(row.recovery, `${row.kind}/${row.group}: recovery`).toBeCloseTo(affected ? (691 / 1024) ** 2 : 1, 4);
    expect(row.clear, `${row.kind}/${row.group}: restore`).toBeCloseTo(1, 4);
  }
});
