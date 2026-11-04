import { expect, it } from 'vitest';
import { tauntLayout, drawTaunts } from '../src/tauntLayout';
import { BOT_GOLD, botDisplayName, plainBotText } from '../src/botPresentation';
const state = { open: true, root: 1, row: 0, depth: 1, nextSend: 0, cooldowns: [0, 0, 0, 0, 0, 0], voiceHeld: false, columns: [], roots: [0, 1, 2, 3, 4] };
it('teammate menu measures and draws a bot\'s name without clipping its display tokens: the gold initial, the remaining name uncoloured', () => {
  const name = botDisplayName('Botty McBotface', true);
  const st = { ...state, root: 3, columns: [{ selected: 0, rows: [{ label: name, help: 'Player 1', arrow: true }] }] };
  const items = tauntLayout(st, [], 0);
  expect(items.some((i) => i.kind === 'text' && plainBotText(i.text) === 'Botty McBotface')).toBe(true);
  const drawn = drawTaunts({ width: 640, height: 448 }, st, [], 0, { 'font_text_01.tif': { width: 512, height: 128 } });
  const gold = BOT_GOLD.map((c) => c / 128).join();
  expect(drawn.quads.filter((q) => q.rgba.slice(0, 3).join() === gold)).toHaveLength(1);
});
it('keeps native help UVs and fades the right edge of each TCM panel', () => {
  const items = tauntLayout(state, ['one', 'two', 'three', 'four', 'five'], 0);
  const help = items.filter(i => i.kind === 'sprite' && i.y === 20);
  expect(help.map(i => i.kind === 'sprite' ? i.src : null)).toEqual([[.7, 0, .3, 1], [.7, 0, .3, 1]]);
  const drawn = drawTaunts({ width: 640, height: 448 }, state, [], 0, { 'tcm.tif': { width: 128, height: 64 } });
  expect(drawn.quads[1]).toMatchObject({ alphaRight: 0, element: 'chatMenu' });
});
it('SVC-23f: the drawn roots in the order of the tree -- SPECTATORS between TEAMMATES and MESSAGES while drawn, its help "Spectator controls"', () => {
  const texts = (st: typeof state) => tauntLayout(st, [], 0).filter((i) => i.kind === 'text').map((i) => (i.kind === 'text' ? i.text : ''));
  expect(texts({ ...state, depth: 0, root: 4 })).toEqual(['TACTICAL ORDERS', 'TAUNTS', 'RADIO', 'TEAMMATES', 'MESSAGES', 'Send custom text messages']);
  expect(texts({ ...state, depth: 0, root: 5, roots: [0, 1, 2, 3, 5, 4] }))
    .toEqual(['TACTICAL ORDERS', 'TAUNTS', 'RADIO', 'TEAMMATES', 'SPECTATORS', 'MESSAGES', 'Spectator controls']);
});
