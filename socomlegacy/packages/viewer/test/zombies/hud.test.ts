// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { ZombieHud, waveTallies } from '../../src/zombies/hud';

beforeEach(() => { document.body.innerHTML = ''; });

it('groups wave tally strokes into fives and uses numerals for late rounds', () => {
  const d = document.createElement('div');
  d.innerHTML = waveTallies(7);
  expect(d.querySelectorAll('i')).toHaveLength(7);
  expect(d.querySelectorAll('.slash')).toHaveLength(1);
  expect(d.querySelectorAll('.tally')).toHaveLength(2);
  expect(waveTallies(21)).toBe('<b>21</b>');
});

it('shows round events, health and kills, then hides and clears on reset', () => {
  const h = new ZombieHud();
  const cues: string[] = [];
  h.setCues((name) => cues.push(name));
  h.roundCue(1);
  h.frame(100, 0, .1);
  expect(h.stats()).toMatchObject({ visible: true, health: 100, kills: 0, cues: ['round-start'] });
  h.frame(75, 2, .1);
  expect(document.querySelector('.z-status em')?.textContent).toBe('-25');
  expect(h.stats()).toMatchObject({ health: 75, kills: 2 });
  h.roundCue(1, true);
  expect(h.stats().cues).toEqual(['round-start', 'round-end']);
  expect(cues).toEqual(['round-start', 'round-end']);
  h.reset();
  expect(h.stats()).toMatchObject({ visible: false, health: 100, kills: 0, cues: [] });
});
