// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { Settings } from '@s2u/card';
import {
  CLAN_TAGS_ADAPTATION, CLAN_TAGS_CHOICES, CLAN_TAGS_DEFAULT_ADAPTATION, CLAN_TAGS_KEY, CLAN_TAGS_WORDS, clanTagsShown, labelTag,
  readClanTags, resetClanTagsCache, saveClanTags,
} from '../src/clanTagOption';
import { spectatorInfoText, spectatorTitleName, taggedName } from '../src/hudLayout';
import { teamTags } from '../src/hudTags';
import { targetName } from '../src/reticle';
import { speakerText } from '../src/hudVoice';
import { roundScreenLayout, type RoundScreen } from '../src/roundScreens';
import type { ScoreRowInfo } from '../src/scoreboard';
import { PAGE_SETTING_KEYS, pageSettings } from '../src/pageStore';

/**
 * PSR-5 (product track, **a browser adaptation** -- never parity; the owner's ruling R4P.R11, 2026-11-23): clan tags dropped from
 * the in-play name labels, a client option, off by default. `s2u.viewer.clanTagsInLabels`, 'shown' (r0004's "[TAG] name") or
 * 'hidden'. The scoreboard's tag column is not a label and is not touched.
 */
function memory(): { settings: Settings; data: Map<string, string> } {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
  return { settings: new Settings(() => storage as unknown as Storage, { report: () => {} } as never), data };
}
afterEach(() => { localStorage.clear(); resetClanTagsCache(); });

describe('PSR-5: the option (s2u.viewer.clanTagsInLabels), a browser adaptation', () => {
  it('names the ruling and the owner\'s words; the key is in the page\'s inventory; Shown / Hidden, Shown by default', () => {
    expect(CLAN_TAGS_ADAPTATION).toContain('R4P.R11');
    expect(CLAN_TAGS_ADAPTATION).toContain('clan tags dropped from name labels -- client option, off by default');
    expect(CLAN_TAGS_KEY).toBe('s2u.viewer.clanTagsInLabels');
    expect(PAGE_SETTING_KEYS).toContain(CLAN_TAGS_KEY);
    expect(CLAN_TAGS_CHOICES).toEqual(['shown', 'hidden']);
    expect(CLAN_TAGS_CHOICES.map((c) => CLAN_TAGS_WORDS[c])).toEqual(['Shown', 'Hidden']);
    expect(CLAN_TAGS_DEFAULT_ADAPTATION).toBe('shown');
  });

  it('reads the default unset or unknown, and what was saved', () => {
    const { settings, data } = memory();
    expect(readClanTags(settings)).toBe('shown');
    data.set(CLAN_TAGS_KEY, 'bogus');
    expect(readClanTags(settings)).toBe('shown');
    saveClanTags('hidden', settings);
    expect(data.get(CLAN_TAGS_KEY)).toBe('hidden');
    expect(readClanTags(settings)).toBe('hidden');
    saveClanTags('shown', settings);
    expect(readClanTags(settings)).toBe('shown');
  });

  it('the labels read the page\'s setting: shown unset, hidden once saved to the page, back at once on a save', () => {
    expect(clanTagsShown()).toBe(true);
    saveClanTags('hidden');
    expect(localStorage.getItem(CLAN_TAGS_KEY)).toBe('hidden');
    expect(clanTagsShown()).toBe(false);
    expect(labelTag('NSW')).toBe('');
    saveClanTags('shown');
    expect(labelTag('NSW')).toBe('NSW');
  });

  it('a stored hidden is read by the labels after a reset of the cache (a new page load)', () => {
    pageSettings.set(CLAN_TAGS_KEY, 'hidden');
    resetClanTagsCache();
    expect(clanTagsShown()).toBe(false);
  });
});

const eye = (): PerspectiveCamera => { const c = new PerspectiveCamera(60, 640 / 448, 1, 10000); c.updateMatrixWorld(); c.updateProjectionMatrix(); return c; };
const overhead = (): string | undefined => teamTags({
  self: { id: 1, team: 'seal' }, camera: eye(), holder: null,
  bodies: [{ id: 2, team: 'seal', dead: null, escortee: false, head: [0, 0, -100], name: 'BRAVO', clan: 'NSW' }],
}).points[0]?.text;
const spectatorTitle = (): string => spectatorInfoText({ followed: { name: 'BRAVO', tag: 'NSW' } } as never).title;

describe('PSR-5: each in-play label, "[TAG] name" shown and "name" hidden', () => {
  const labels = (): Record<string, string | undefined> => ({
    infoBox: taggedName('NSW', 'BRAVO'),
    overhead: overhead(),
    reticle: targetName('NSW', 'BRAVO'),
    spectatorTitle: spectatorTitleName('NSW', 'BRAVO'),
    spectatorPanel: spectatorTitle(),
    speaker: speakerText('BRAVO', 'NSW') ?? undefined,
  });

  it('shown (the default): every label is "[NSW] BRAVO"', () => {
    expect(labels()).toEqual({
      infoBox: '[NSW] BRAVO', overhead: '[NSW] BRAVO', reticle: '[NSW] BRAVO', spectatorTitle: '[NSW] BRAVO',
      spectatorPanel: '[NSW] BRAVO', speaker: '[NSW] BRAVO',
    });
  });

  // The owner, through the controller (2026-11-23): the end-of-round MVP caption too, so the option is one consistent rule.
  it('GAME COMPLETE\'s MVP caption: "[NSW] BRAVO" shown, "BRAVO" hidden', () => {
    const row: ScoreRowInfo = { id: 1, name: 'BRAVO', team: 'seal', kills: 1, deaths: 0, score: 9, alive: true, self: false, clan: 'NSW' };
    const screen: RoundScreen = { kind: 'gameComplete', secondsLeft: 10, elapsed: 5, winner: null, timePlayed: 367, wins: { seal: 1, terrorist: 0 }, rows: [row] } as RoundScreen;
    const mvp = (): string | undefined => roundScreenLayout(screen).texts.find((t) => t.role === 'mvp')?.text;
    expect(mvp()).toBe('[NSW] BRAVO');
    saveClanTags('hidden');
    expect(mvp()).toBe('BRAVO');
  });

  it('hidden: every label is "BRAVO"', () => {
    saveClanTags('hidden');
    expect(labels()).toEqual({
      infoBox: 'BRAVO', overhead: 'BRAVO', reticle: 'BRAVO', spectatorTitle: 'BRAVO', spectatorPanel: 'BRAVO', speaker: 'BRAVO',
    });
  });

  it('the reticle keeps its two-character rule when shown, and a one-character tag stays bare either way', () => {
    expect(targetName('X', 'BRAVO')).toBe('BRAVO');
    expect(targetName('NS', 'BRAVO')).toBe('[NS] BRAVO');
    saveClanTags('hidden');
    expect(targetName('NS', 'BRAVO')).toBe('BRAVO');
  });

  it('a name with no tag is the name either way, and a null speaker stays null', () => {
    saveClanTags('hidden');
    expect(taggedName('', 'BRAVO')).toBe('BRAVO');
    expect(speakerText(null, 'NSW')).toBeNull();
  });

  it('the scoreboard\'s tag column is untouched: its source does not read the option', () => {
    const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf-8');
    expect(src('scoreboard.ts')).not.toMatch(/clanTagOption|labelTag/);
  });
});
