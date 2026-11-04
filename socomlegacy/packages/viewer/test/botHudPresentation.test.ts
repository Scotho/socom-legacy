import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { AT_REST, DEFAULT_MODEL, Hud, hudLayout, hudPass, infoBoxName, spectatorHudView } from '../src/hud';
import { teamTagInput, teamTags } from '../src/hudTags';
import { FONT_TEXT_01, layoutText, textWidth } from '../src/hudFont';
import { targetName } from '../src/reticle';
import { BOT_GOLD, botDisplayName, plainBotText } from '../src/botPresentation';

const FRAME = { width: 640, height: 448 };
const SIZES = { 'font_text_01.tif': { width: 512, height: 128 }, 'newweapnbkrnd.tif': { width: 173, height: 74 } };
const gold = BOT_GOLD.map((channel) => channel / 128).join();
const goldCount = (quads: ReturnType<typeof hudLayout>['quads']) => quads.filter((quad) => quad.texture === FONT_TEXT_01.texture && quad.rgba.slice(0, 3).join() === gold).length;

// Authored adaptation: every bot has one gold initial; other characters retain their line's ink.
describe('a bot initial is gold with the rest in the line\'s own ink', () => {
  it.each(['Freq', 'Cav', 'Orion', 'Botty McBotface', 'CPU 1'])('%s: the gold initial, then the remaining name uncoloured, its width unchanged', (name) => {
    const styled = botDisplayName(name, true);
    expect(plainBotText(styled)).toBe(name);
    expect(textWidth(styled, 0.9)).toBe(textWidth(name, 0.9));
    const { glyphs, width } = layoutText(styled, 0, 0, 0.9);
    expect(width).toBe(textWidth(styled, 0.9));
    expect(glyphs.slice(0, 1).map((g) => g.rgb)).toEqual([BOT_GOLD]);
    expect(glyphs.slice(1).every((g) => !g.rgb)).toBe(true);
    expect(layoutText(botDisplayName(name), 0, 0, 1).glyphs.every((g) => !g.rgb)).toBe(true);
    expect(layoutText(botDisplayName(styled), 0, 0, 1).glyphs.every((g) => !g.rgb)).toBe(true);
  });

  it('a kill line of two bots: two gold initials, nothing else coloured', () => {
    const line = `${botDisplayName('Freq', true)} fragged ${botDisplayName('Cav', true)} with M4`;
    const hud = new Hud(); hud.setVisible(true); hud.postMessage(line); hud.step(0.5);
    expect(hud.postsForDev()[0]!.text).toBe('Freq fragged Cav with M4');
    const glyphs = layoutText(line, 0, 0, 1).glyphs;
    expect(glyphs.filter((g) => g.rgb).length).toBe(2);
    expect(glyphs.filter((g) => g.rgb).every((g) => g.rgb!.join() === BOT_GOLD.join())).toBe(true);
  });

  it('the native info-box cut counts visible letters and keeps the marker', () => {
    const long = `${botDisplayName('Botty McBotface', true)} extra-long`;
    const cut = infoBoxName(long);
    expect(plainBotText(cut)).toBe(infoBoxName(plainBotText(long)));
    const glyphs = layoutText(cut, 0, 0, 1).glyphs;
    expect(glyphs.slice(0, 1).map((g) => g.rgb)).toEqual([BOT_GOLD]);
    expect(glyphs.slice(1).every((g) => !g.rgb)).toBe(true);
  });

  it('the scoreboard: a bot row\'s gold initial alone, a matching human name plain', () => {
    const hud = new Hud();
    hud.setScoreRows([
      { id: 1, name: 'Orion', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, bot: true, self: false },
      { id: 2, name: 'Orion', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, self: false },
    ], []);
    const quads = hudPass(FRAME, { ...hud.state().model, scoreboard: true }, SIZES, AT_REST, false, null, 'ps2').quads;
    expect(quads.filter((q) => q.rgba.slice(0, 3).join() === '0.71875,0.5625,1')).toHaveLength(0);
    expect(goldCount(quads)).toBe(1);
    expect(hud.state().model.scoreRows.rows?.map((r) => r.name)).toEqual(['Orion', 'Orion']);
  });

  it('overhead tags and spectator follow: the initial after a clan prefix gold', () => {
    const camera = new PerspectiveCamera(60, 640 / 448, 1, 1000);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const page = {
      client: { id: 1, role: 'player', team: 'seal' as const }, rows: [{ id: 2, bot: true as const, clan: 'CPU', kills: 0, deaths: 0, score: 0 }],
      nameOf: () => 'Freq',
    };
    const tags = teamTags(teamTagInput(page, { headAt: () => [0, 0, -100], deathAge: () => null, teamOf: () => 'seal' }, camera, { holder: null }));
    expect(plainBotText(tags.points[0]!.text)).toBe('[CPU] Freq');
    expect(layoutText(tags.points[0]!.text, 0, 0, 1).glyphs.at(-4)!.rgb).toEqual(BOT_GOLD);
    const spectator = spectatorHudView({ ...page, client: { role: 'spectator', healthOf: () => 1 },
      spectator: { mode: 'follow', target: 2, scenic: 0, watching: null, benched: false },
    }, { mode: () => 'fly', isDead: () => false });
    expect(layoutText(spectator!.followed!.name, 0, 0, 1).glyphs.at(-4)!.rgb).toEqual(BOT_GOLD);
  });
});

describe('persistent authored in-game bot initial ink', () => {
  it('a human clan tag cannot supply trusted bot ink to the scoreboard, own panel or reticle', () => {
    const clan = botDisplayName('Clan', true);
    const hud = new Hud();
    hud.setPlayerName('Human', clan);
    expect(goldCount(hudLayout(FRAME, hud.state().model, SIZES).quads)).toBe(0);
    hud.setScoreRows([{ id: 1, name: 'Human', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, self: true, clan }], []);
    expect(goldCount(hudLayout(FRAME, { ...hud.state().model, scoreboard: true }, SIZES).quads)).toBe(0);
    expect(layoutText(targetName(clan, 'Human'), 0, 0, 1).glyphs.some((g) => g.rgb)).toBe(false);
  });

  it('display-looking text in an authoritative human name never supplies a bot flag or gold ink', () => {
    const name = botDisplayName(botDisplayName('Human', true), false);
    expect(name).toBe('Human');
    expect(hudLayout(FRAME, { ...DEFAULT_MODEL, name }, SIZES).quads.some((quad) => quad.rgba.slice(0, 3).join() === gold)).toBe(false);
  });

  it('the ally identity path consumes explicit bot metadata and draws only its initial in gold', () => {
    const camera = new PerspectiveCamera(60, 640 / 448, 1, 1000);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const page = {
      client: { id: 1, role: 'player', team: 'seal' as const }, rows: [{ id: 2, bot: true as const }, { id: 3, clan: 'NSW' }],
      nameOf: (id: number) => id === 2 ? 'Jester' : 'BOT Human',
    };
    const remotes = { headAt: (id: number) => [id === 2 ? -20 : 20, 0, -100], deathAge: () => null, teamOf: () => 'seal' as const };
    const tags = teamTags(teamTagInput(page, remotes, camera, { holder: null }));
    expect(tags.points.map((point) => plainBotText(point.text))).toEqual(['Jester', '[NSW] BOT Human']);
    const quads = hudLayout(FRAME, { ...DEFAULT_MODEL, teamTags: tags }, SIZES).quads.filter((quad) => quad.element === 'teamTags');
    expect(goldCount(quads)).toBe(1);
    expect(quads.some((quad) => quad.rgba.slice(0, 3).join() === '1,1,1')).toBe(true);
    expect(page.nameOf(2)).toBe('Jester');
    expect(page.rows[0]).toEqual({ id: 2, bot: true });
  });

  it('spectator identity retains a gold initial while following a named actor', () => {
    const spectator = spectatorHudView({
      client: { role: 'spectator', healthOf: () => 1 },
      spectator: { mode: 'follow', target: 2, scenic: 0, watching: null, benched: false },
      rows: [{ id: 2, bot: true, kills: 1, deaths: 0, score: 3 }], nameOf: () => 'Jester',
    }, { mode: () => 'fly', isDead: () => false });
    expect(plainBotText(spectator!.followed!.name)).toBe('Jester');
    expect(goldCount(hudLayout(FRAME, { ...DEFAULT_MODEL, spectator }, SIZES).quads)).toBeGreaterThanOrEqual(1);
  });

  it('uses trusted bot identity before a spectator score row arrives', () => {
    const spectator = spectatorHudView({
      client: { role: 'spectator', healthOf: () => 1 },
      spectator: { mode: 'follow', target: 2, scenic: 0, watching: null, benched: false },
      rows: [], nameOf: () => 'Jester', isBot: (id) => id === 2,
    }, { mode: () => 'fly', isDead: () => false });
    expect(plainBotText(spectator!.followed!.name)).toBe('Jester');
  });

  it('killfeed presentation keeps multiple explicit bot initials gold and its readable diagnostics plain', () => {
    const hud = new Hud();
    hud.setVisible(true);
    hud.postMessage(`${botDisplayName('Jester', true)} fragged ${botDisplayName('Volkov', true)} with M4A1`);
    hud.step(0.5);
    expect(hud.postsForDev()[0]!.text).toBe('Jester fragged Volkov with M4A1');
    expect(goldCount(hudLayout(FRAME, hud.state().model, SIZES).quads.filter((quad) => quad.element === 'message'))).toBe(2);
  });
});
