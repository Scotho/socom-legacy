// @vitest-environment node
//
// 1.2.0: the authored marks adopted from the public site (MU.R21; README, "From the public site"). Strings only.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { ICONS, ICON_SIZES, icon } from './icons';

const here = (f: string) => new URL(`./${f}`, import.meta.url);
const tokensCss = readFileSync(here('tokens.css'), 'utf-8');
const emblem = readFileSync(here('emblem.svg'), 'utf-8');
const NAMES = ['play', 'news', 'roadmap', 'journey', 'archive', 'playtest', 'external', 'back', 'server', 'status', 'leaderboard'] as const;

describe('icons.ts: the authored marks', () => {
  it('holds exactly the eleven authored marks: the eight of 1.2.0, the server of 1.3.0, the status mark and the leaderboard mark (the four brand marks wait on the owner, Q2)', () => {
    expect(Object.keys(ICONS).sort()).toEqual([...NAMES].sort());
  });
  it('the sizes are the ds scale 16, 20, 24, 40', () => {
    expect([...ICON_SIZES]).toEqual([16, 20, 24, 40]);
  });
  it.each(NAMES)('%s is decorative (aria-hidden, not focusable), takes its colour from the text and carries no fixed colour', (n) => {
    const svg = icon(n);
    expect(svg).toMatch(/^<svg [^>]*aria-hidden="true"/);
    expect(svg).toContain('focusable="false"');
    expect(svg).toContain('currentColor');
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl/i);
    expect(svg).not.toMatch(/<(title|desc)\b/);
    expect(/^<svg [^>]*>/.exec(svg)![0]).not.toMatch(/\s(width|height)=/);
  });
  it.each(NAMES)('%s carries no four dotted numbers in a row (the leak check reads them as an address)', (n) => {
    expect(icon(n)).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });
  it('a size picks the ds class, `s2u-icon` for 20 and `s2u-icon--N` otherwise; any other size is refused', () => {
    expect(icon('play')).toContain('class="s2u-icon"');
    expect(icon('news', 24)).toContain('class="s2u-icon s2u-icon--24"');
    expect(icon('back', 16)).toContain('class="s2u-icon s2u-icon--16"');
    expect(() => icon('back', 18 as never)).toThrow();
  });
});

describe('1.3.0: the server mark (authored; README, "From the live site")', () => {
  it('is a stroke drawing on the 24 grid, in the same stroke as the guide marks', () => {
    expect(ICONS.server).toContain('stroke="currentColor"');
    expect(ICONS.server).toContain('stroke-width="1.5"');
    expect(icon('server', 20)).toBe(`<svg class="s2u-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS.server}</svg>`);
  });
});

describe('the leaderboard mark (LCM-16, LCM.R18 (e); authored, additive)', () => {
  it('is a stroke drawing on the 24 grid in the guide marks\' group and stroke, as the server and status marks', () => {
    expect(ICONS.leaderboard).toContain('stroke="currentColor"');
    expect(ICONS.leaderboard).toContain('stroke-width="1.5"');
    expect(ICONS.leaderboard.startsWith('<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">')).toBe(true);
    expect(icon('leaderboard', 20)).toBe(`<svg class="s2u-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS.leaderboard}</svg>`);
  });
  it('is the 2.4.0 contract (additive: a minor bump), carried in tokens.css, and the README counts eleven marks and names it', () => {
    const version = readFileSync(here('VERSION'), 'utf-8').trim();
    const [maj, min] = version.split('.').map(Number);
    expect(maj * 100 + min).toBeGreaterThanOrEqual(204);
    expect(tokensCss).toContain(`--s2u-version: "${version}"`);
    const readme = readFileSync(here('README.md'), 'utf-8');
    expect(readme).toMatch(/`icons\.ts`: eleven marks drawn by the project -- [^.]*\bstatus, leaderboard\b/);
    expect(readme).not.toMatch(/\bten marks\b/);
    expect(readme).toContain('## The leaderboard mark (2.4.0)');
  });
});

describe('emblem.svg: the authored brand emblem', () => {
  it('is named SOCOM II Legacy (the live site public name, MU.R24 Q-A; LS-1 renamed it from "SOCOM 2 Legacy")', () => {
    expect(emblem).toContain('aria-label="SOCOM II Legacy"');
    expect(emblem).toContain('role="img"');
    expect(emblem).not.toMatch(/SOCOM 2/i);
  });
  it('draws only token colours (ground, gold, gold-source, gold-display)', () => {
    const known = new Set([...tokensCss.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1].toLowerCase()));
    const used = [...emblem.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1].toLowerCase());
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((h) => !known.has(h))).toEqual([]);
  });
  it('holds no address, no script, no external reference', () => {
    expect(emblem.replace('xmlns="http://www.w3.org/2000/svg"', '')).not.toMatch(/\d+\.\d+\.\d+\.\d+|<script|href=|xlink|https?:/);
  });
});
