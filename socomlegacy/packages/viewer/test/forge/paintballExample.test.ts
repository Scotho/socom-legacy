import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Object3D } from 'three';
import { ENGINE_CONTRACT_VERSION, PACK_TARGET_US, validatePack, type PackRef } from '@s2u/creator-contracts';
import { DEFAULT_RIFLE, HELD_SIDEARM, M67, arsenalOf, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import type { Conn, Room, RoundOverReport } from '../../../match/src/room';
import { ForgeAgentError } from '../../src/forge/agent/api';
import { createForgeAgentRevisions, createForgeEditorFacade, type ForgeAgentEditor } from '../../src/forge/agent/editorFacade';
import { emptyLayout, type Layout, type LayoutBase } from '../../src/forge/layout';
import { forgePlayRules, forgeRuleHost } from '../../src/forge/matchRules';
import type { ForgeLayout, RulesPackFile } from '../../src/forge/rulesAuthoring';
import { freshHealth } from '../../src/net/damage';
import { LoopbackMatch } from '../../src/net/loopback';
import {
  cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ,
  type Command, type ServerEvent, type SimKits, type SimMap,
} from '../../src/sim';

/**
 * FCW-13 (product track, OT.R53; re-cast by FCW.R18): the paintball example pack
 * (`packages/creator-contracts/examples/paintball/`) through the Forge's real editor facade, the agent's path
 * (`forge.rules.import`, `forge.rules.check`, `forge.rules.config.set`, `forge.rules.test`, `forge.rules.export`,
 * `forge.rules.clear`), on FCW-34's frame (`ctfExample.test.ts`: the fake editor under the real facade, its rig copied).
 * The scripted runs are the example's own data (`paintball.run.json`); a run's room outcomes are what its script says
 * (`RULES_TEST_ADAPTATION`: a recording room), so it tells the room's `player.eliminated` itself.
 *
 * P3 (the dispatcher, 2026-10-27; written once, FCW-34's row points here): the clean disable THROUGH THE ROOM -- the
 * page's own room (`LoopbackMatch`, solo, stepped here) built as Play builds it (`forgePlayRules` -> `forgeRuleHost` ->
 * `ruleHost`), one rifle round fired down the cone's centre. With the pack on and its default loadout, the rifle is not
 * a marker: no damage, no elimination; with the loadout `any`, the one hit eliminates; after `rules.clear` the layout
 * plays no rules and the same round lays the vanilla damage, equal to a room with no host; and a host disabled
 * mid-match (pack-off) lays it too. The room rig (the flat floor, the kit, the seeded random, the fire) is
 * `match/test/creator/rulesHarness.ts`', copied: test plumbing only. Unit and room-level evidence: no rendered run.
 */

type Json = Record<string, unknown>;
type V3 = [number, number, number];
const EXAMPLES = fileURLToPath(new URL('../../../creator-contracts/examples/', import.meta.url));
const PACK = ['s2u-pack.json', 'rules/paintball.json'] as const;
const packFiles = (): RulesPackFile[] => PACK.map((path) => ({ path, text: readFileSync(`${EXAMPLES}paintball/${path}`, 'utf8') }));
const packBytes = (path: string): Uint8Array => new Uint8Array(readFileSync(`${EXAMPLES}paintball/${path}`));
type Script = { seed?: number; players: Json[]; ticks: Json[] };
const pbRun = (): { script: Script; expect: { fired: string[] }; duplicate: { script: Script; expect: { fired: string[] } };
  disallowed: { script: Script; expect: { fired: string[] }; any: { fired: string[] } } } =>
  JSON.parse(readFileSync(`${EXAMPLES}paintball.run.json`, 'utf8'));
async function packRef(): Promise<PackRef> {
  const checked = await validatePack(PACK.map((path) => ({ path, bytes: packBytes(path) })), { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION });
  if (!checked.ok) throw new Error(`the example must validate: ${JSON.stringify(checked.report.diagnostics)}`);
  return { id: checked.ref.id, version: checked.ref.version, hash: checked.ref.hash };
}

// The rig of rulesFacade.test.ts (as ctfExample.test.ts copies it), unchanged: a fake editor under the real facade.
function rig(start: ForgeLayout = emptyLayout({ kind: 'blank', library: 'MP2' } as LayoutBase) as ForgeLayout) {
  const base: LayoutBase = { kind: 'blank', library: 'MP2' } as LayoutBase;
  let layout: ForgeLayout = start;
  const picks: Object3D[] = [];
  const committed: ForgeLayout[] = [];
  const editor: ForgeAgentEditor = {
    revisions: createForgeAgentRevisions(),
    play: { execute: vi.fn(() => ({ ok: true, data: null })), status: () => null, read: () => null, cancel: vi.fn() } as unknown as ForgeAgentEditor['play'],
    operations: { active: () => null, get: () => undefined } as unknown as ForgeAgentEditor['operations'],
    shotDriver: null, mapBounds: () => null, savedElsewhereWords: 'Saved elsewhere, reloaded',
    mode: () => 'forge-editor', picks: () => picks, base: () => base, busy: () => false, checking: () => false,
    layoutName: () => 'Paintball', layoutNow: () => JSON.parse(JSON.stringify(layout)) as ForgeLayout,
    selectionIds: () => [], placementIds: () => new Map(), npcOf: () => undefined, bombKindOf: () => null, lockedOf: () => false,
    entries: () => [], palette: () => [], characters: () => [], charLabel: () => '', absent: () => new Set(), paletteArchive: () => 'MP2',
    chosen: () => null, npcChoice: () => null, favourites: () => new Set(), filter: () => 'all', showChars: () => false, query: () => '',
    hiddenKeys: () => new Set(), baseMap: () => null, charMap: () => null,
    view: () => ({ wireframe: false } as unknown as ReturnType<ForgeAgentEditor['view']>), snap: () => false, gridStep: () => 25,
    turnStep: () => 15, tool: () => 'select', gizmoMode: () => 'translate', camera: () => ({ x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }),
    named: () => [], namedAt: () => 0,
    history: { canUndo: () => false, canRedo: () => false, peekUndo: () => null, peekRedo: () => null, undo: vi.fn(), redo: vi.fn() } as unknown as ForgeAgentEditor['history'],
    inMatch: () => false, matchOfLobby: () => false, playing: () => false, statusText: () => '', clipboard: () => [],
    queryAssets: vi.fn(), checkPlacement: vi.fn(), starterContext: vi.fn(), missingPacks: () => [], missingPacksWords: () => '',
    prepareLayout: vi.fn(async (l: Layout) => ({ missing: 0, dispose: vi.fn(), commit: () => { committed.push(l as ForgeLayout); layout = JSON.parse(JSON.stringify(l)) as ForgeLayout; } })),
    applyPicked: vi.fn(), changed: vi.fn(), refreshUndo: vi.fn(), edit: vi.fn(), noteMissingPacks: vi.fn(), adoptLayoutCamera: vi.fn(),
    copySelection: vi.fn(), collectCheck: vi.fn(async () => null), loadArchive: vi.fn(), setPalette: vi.fn(), lookAtPoint: vi.fn(),
    saveCamera: vi.fn(), persistNamed: vi.fn(async () => 'written' as const), startMatch: vi.fn(async () => undefined),
    startPlay: vi.fn(async () => undefined), setView: vi.fn(), setCameraPose: vi.fn(), lookFrom: vi.fn(), focusOn: vi.fn(), setQuery: vi.fn(),
    setPaletteFilter: vi.fn(), choose: vi.fn(), setFavourite: vi.fn(), setSnap: vi.fn(), setTool: vi.fn(), stopPlay: vi.fn(), endMatch: vi.fn(), rereadLists: vi.fn(),
  };
  const facade = createForgeEditorFacade(editor);
  const run = async (operation: string, args: Json = {}): Promise<unknown> => (await facade.prepare(operation, args, () => undefined)).commit();
  return { editor, facade, committed, run, now: () => layout };
}
const refusal = async (p: Promise<unknown>): Promise<ForgeAgentError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ForgeAgentError);
  return e as ForgeAgentError;
};
/** The blank floor with the paintball pack imported: it names no entity, so nothing is placed first. */
async function imported(): Promise<ReturnType<typeof rig>> {
  const r = rig();
  await r.run('rules.import', { files: packFiles() });
  return r;
}
type TestRun = { state: string; fired: string[]; variables: Json; shows: Json[]; applied: Json[]; diagnostics: unknown[] };
/** The room actions a run recorded, without their ticks, of one kind. */
const acts = (out: TestRun, what: string): Json[] => out.applied.filter((a) => a['do'] === what).map(({ tick: _tick, do: _do, ...rest }) => rest);
const hit = (attacker: number, victim: number, weaponClass: string): Json =>
  ({ name: 'player.hit', attacker, victim, fields: { weapon: 'authored test weapon', weaponClass, amount: 30 } });

describe('FCW-13: the paintball example through the Forge facade (the agent path)', () => {
  it('rules.import keeps the pack\'s own digest; the layout requires it and plays its mode, with no entity placed', async () => {
    const ref = await packRef();
    const r = await imported();
    const l = r.now();
    expect(l.rules!.pack).toEqual(ref);
    expect(l.requires).toEqual([ref]);
    expect(l.mode).toEqual({ id: 'paintball', version: '1.0.0', params: {} });
  });

  it('rules.check passes on the blank floor (its answer is `{ report, record }`)', async () => {
    const r = await imported();
    const { report } = await r.run('rules.check') as { report: { status: string; diagnostics: unknown[] } };
    expect(report.diagnostics, JSON.stringify(report)).toEqual([]);
    expect(report.status).toBe('pass');
  });

  it('rules.test: one marker hit eliminates -- no damage asked, the victim out, a point to the shooter\'s side, the side out ends the round', async () => {
    const r = await imported();
    const run = pbRun();
    const out = await r.run('rules.test', run.script) as TestRun;
    expect(out.diagnostics).toEqual([]);
    expect(out.state).toBe('on');
    expect(out.fired).toEqual(run.expect.fired);
    expect(acts(out, 'eliminate')).toEqual([{ player: 2 }]);
    expect(acts(out, 'award')).toEqual([{ to: { team: 'seal' }, points: 1 }]);
    expect(acts(out, 'round.end')).toEqual([{ winner: 'seal' }]);
    expect(acts(out, 'damage')).toEqual([]);
    expect(out.variables['marks@2'], JSON.stringify(out.variables)).toBe(1);
    expect(out.variables['eliminated@2'], JSON.stringify(out.variables)).toBe(true);
  });

  it('rules.test: a duplicate hit on the out victim, a forged hit from him, a friendly hit and a forged kill count nothing -- out and scored once', async () => {
    const r = await imported();
    const { duplicate } = pbRun();
    const out = await r.run('rules.test', duplicate.script) as TestRun;
    expect(out.diagnostics).toEqual([]);
    expect(out.fired).toEqual(duplicate.expect.fired);
    expect(acts(out, 'eliminate')).toEqual([{ player: 2 }]);
    expect(acts(out, 'award')).toEqual([{ to: { team: 'seal' }, points: 1 }]);
    expect(out.variables['marks@2']).toBe(1);
    expect(out.variables['marks@1'] ?? 0).toBe(0);
    expect(out.variables['eliminated@1'] ?? false).toBe(false);
  });

  it('rules.test: a disallowed weapon (a rifle, under the default sidearms-only loadout) marks nothing; with the loadout `any` set over MCP it eliminates', async () => {
    const r = await imported();
    const { disallowed } = pbRun();
    const out = await r.run('rules.test', disallowed.script) as TestRun;
    expect(out.diagnostics).toEqual([]);
    expect(out.fired).toEqual(disallowed.expect.fired);
    expect(acts(out, 'eliminate')).toEqual([]);
    expect(acts(out, 'award')).toEqual([]);
    expect(out.variables['marks@2'] ?? 0).toBe(0);
    await r.run('rules.config.set', { params: { loadout: 'any' } });
    expect(r.now().mode!.params).toEqual({ loadout: 'any' });
    const any = await r.run('rules.test', disallowed.script) as TestRun;
    expect(any.diagnostics).toEqual([]);
    expect(any.fired).toEqual(disallowed.any.fired);
    expect(acts(any, 'eliminate')).toEqual([{ player: 2 }]);
  });

  it('rules.test: the hits setting -- at two, the first marker hit marks and the second eliminates', async () => {
    const r = await imported();
    await r.run('rules.config.set', { params: { hits: 2 } });
    const script = { seed: 13, players: [{ id: 1, team: 'seal', at: [0, 0, 0] }, { id: 2, team: 'terrorist', at: [300, 0, 0] }],
      ticks: [{ events: [hit(1, 2, 'pistol')] }, { events: [hit(1, 2, 'pistol')] }] };
    const out = await r.run('rules.test', script) as TestRun;
    expect(out.diagnostics).toEqual([]);
    expect(out.fired).toEqual(['start', 'sidearms-only', 'no-damage', 'mark', 'no-damage', 'mark', 'out']);
    expect(acts(out, 'eliminate')).toEqual([{ player: 2 }]);
    expect(out.variables['marks@2']).toBe(2);
  });

  it('a setting out of its bounds or values is refused before any edit', async () => {
    const r = await imported();
    const before = JSON.stringify(r.now());
    await refusal(r.run('rules.config.set', { params: { hits: 0 } }));
    await refusal(r.run('rules.config.set', { params: { loadout: 'rifles' } }));
    expect(JSON.stringify(r.now())).toBe(before);
  });

  it('rules.export gives back the imported pack: its reference and its files byte-equal (never waived)', async () => {
    const ref = await packRef();
    const r = await imported();
    const out = await r.run('rules.export') as { ref: PackRef; files: RulesPackFile[] };
    expect(out.ref).toEqual(ref);
    expect(out.files).toEqual(packFiles());
    for (const f of out.files) expect(new TextEncoder().encode(f.text)).toEqual(packBytes(f.path));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// P3: the clean disable through the page's room. The rig is match/test/creator/rulesHarness.ts', copied (plumbing).
// ---------------------------------------------------------------------------------------------------------------------

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
function flatMap(): SimMap {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(PARAMS, [FLOOR], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}
const item = (name: string, id: number): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]];
/** Both sides: the M4A1 in the primary slot (a rifle: not a marker under the default loadout), the Mark 23, an M67. */
const KIT = [DEFAULT_RIFLE.id, 15, 255, 121, 255] as unknown as Loadout;
function flatKits(): SimKits {
  const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [item('M67', 121)] as never]);
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM].map((x) => [x.id, x])), rounds: new Map(),
      throwables: new Map([[M67.id, { record: M67, piercing: 4 }]]),
    },
    map: {
      valves: new Map(), selectable: { seal: [], terrorist: [] },
      kits: { seal: [{ type: 'S', character: 's', loadout: KIT }], terrorist: [{ type: 'T', character: 't', loadout: KIT }] },
    },
  };
}
function seededRandom(seed = 1): () => number {
  let s = seed;
  return (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
}
const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');
const ticks = (seconds: number): number => Math.round(seconds * TICK_HZ);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** Seat 1 (T) at the origin, seat 2 (S) 150 to its side; a classic round (a 1 s countdown), the record shifted past it. */
const AT: readonly V3[] = [[0, 0, 0], [150, 0, 0]];
const FROM = ticks(1.5);
const FIRE_AT = FROM + ticks(1);

/**
 * The page's room for a layout, built as Play builds it: the layout's rules (`forgePlayRules`) on a rule host
 * (`forgeRuleHost`, the blank floor's names: no door, no switch), or no host when it plays no rules; `null`: a room as
 * main builds it, no host at all. Seat 1 faces seat 2 and fires one round down the cone's centre at its chest.
 */
function duel(layout: ForgeLayout | null) {
  const rules = layout ? forgePlayRules(layout, 13) : null;
  const host = rules ? forgeRuleHost(rules, { doors: [], switches: [] }) : null;
  const reports: RoundOverReport[] = [];
  let room: Room | undefined;
  const place = (): void => { AT.forEach((p, i) => room?.player(i + 1)?.sim.walker.place(p[0], p[1] + 20, p[2])); };
  room = new LoopbackMatch(flatMap(), null, {
    auto: false, kits: flatKits(), soloSide: (id: number) => (id === 1 ? 'terrorist' : 'seal'),
    now: () => 0, random: seededRandom(1), onRoundOver: (r: RoundOverReport) => reports.push(r), onRoundStart: () => place(),
    rules: 'classic', roundSeconds: 20, launchCountdownS: 1, ...(host ? { ruleHost: host } : {}),
  }).room;
  const r = room;
  AT.forEach((_, i) => r.hello(i + 1, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${i + 1}`, map: 'MP99', session: tok(i + 1) }, `10.0.0.${i + 1}`));
  const look = new Map<number, { yaw: number; pitch: number }>();
  const feet = (id: number): V3 => { const w = r.player(id)!.sim.walker.state; return [w.x, w.y, w.z]; };
  const tick = (): void => {
    for (let id = 1; id <= AT.length; id++) {
      const p = r.player(id);
      if (!p) continue;
      const l = look.get(id) ?? { yaw: p.sim.walker.state.yaw, pitch: 0 };
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: l.yaw, pitch: l.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      r.binary(id, encodeCommands({ viewTick: r.tick, commands: [cmd] }));
    }
    r.step();
  };
  const face = (id: number, target: number): void => {
    const t = feet(target);
    look.set(id, faceToward({ feet: feet(id), posture: r.player(id)!.sim.walker.posture }, [t[0], t[1] + 12, t[2]]));
    r.player(id)!.sim.allowSnap();
  };
  const fire = (id: number, target: number): void => {
    const p = r.player(id)!, seq = p.sim.seq, f = p.cone.frame(seq);
    if (!f || !p.alive) return;
    const t = feet(target), point: V3 = [t[0], t[1] + 12, t[2]];
    const { eye: e } = cameraLook(f);
    const c = centreClaim(f, [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]], Math.hypot(point[0] - e[0], point[1] - e[1], point[2] - e[2]));
    r.text(id, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: r.tick });
  };
  /** Runs to the room's tick `until`: seat 1 faces seat 2 at FROM + 0.9 s and fires once at FIRE_AT. */
  const runTo = (until: number, onTick?: (tick: number) => void): void => {
    if (r.tick === 0) { r.step(); place(); }
    while (r.tick < until) {
      onTick?.(r.tick);
      if (r.tick === FROM + ticks(0.9)) face(1, 2);
      if (r.tick === FIRE_AT) fire(1, 2);
      tick();
    }
  };
  return { room: r, host, reports, runTo };
}

describe('FCW-13 P3: the clean disable through the page\'s room (written once; FCW-34\'s row points here)', () => {
  const fresh = (): number[] => [...freshHealth().hp];

  it('the pack on, its default loadout: the rifle round lands (the host hears the hit) and is no marker -- no damage, no elimination', async () => {
    const r = await imported();
    const d = duel(r.now());
    expect(d.host).not.toBeNull();
    d.runTo(FIRE_AT + ticks(0.5));
    const snap = d.host!.snapshot();
    expect(snap.state).toBe('on');
    expect(snap.heard['player.hit'] ?? 0, 'the round hit seat 2').toBeGreaterThan(0);
    const fired = snap.fired.map((f) => f.rule);
    expect(fired).toContain('no-damage');
    expect(fired).not.toContain('mark');
    expect(d.room.player(2)!.alive).toBe(true);
    expect([...d.room.player(2)!.health.hp]).toEqual(fresh());
  });

  it('the pack on, the loadout `any`: the one rifle hit eliminates, and the side out ends the round to the shooter\'s side', async () => {
    const r = await imported();
    await r.run('rules.config.set', { params: { loadout: 'any' } });
    const d = duel(r.now());
    d.runTo(FIRE_AT + ticks(0.5));
    expect(d.host!.snapshot().fired.map((f) => f.rule)).toContain('out');
    expect(d.host!.snapshot().variables['marks@2']).toBe(1);
    expect(d.room.player(2)!.alive).toBe(false);
    d.runTo(ticks(1) + ticks(8));
    expect(d.reports.length).toBeGreaterThanOrEqual(1);
    expect(d.reports[0]!.wins).toEqual({ seal: 0, terrorist: 1 });
  });

  it('after rules.clear: the layout plays no rules, and the same round lays the vanilla damage with the rifle unrestricted -- equal to a room with no host', async () => {
    const r = await imported();
    await r.run('rules.clear');
    const l = r.now();
    expect(l.rules).toBeUndefined();
    expect(l.mode).toBeUndefined();
    expect(l.requires ?? []).not.toContainEqual(await packRef());
    expect((await refusal(r.run('rules.test', pbRun().script))).code).toBe('NO_RULES');
    expect(forgePlayRules(l, 13)).toBeNull();
    const cleared = duel(l);
    expect(cleared.host).toBeNull();
    cleared.runTo(FIRE_AT + ticks(0.5));
    const vanilla = duel(null);
    vanilla.runTo(FIRE_AT + ticks(0.5));
    const hp = [...cleared.room.player(2)!.health.hp];
    expect(sum(hp), 'the rifle round did its damage').toBeLessThan(sum(fresh()));
    expect(cleared.room.player(2)!.alive).toBe(true);
    expect(hp).toEqual([...vanilla.room.player(2)!.health.hp]);
    expect(cleared.room.player(1)!.loadout[0]).toBe(DEFAULT_RIFLE.id);   // the kit as the layout's map gives it: the rifle held
  });

  it('pack-off mid-match: a host disabled before the round is fired lays the vanilla damage too, and its rules fire no more', async () => {
    const r = await imported();
    const d = duel(r.now());
    d.runTo(FIRE_AT, (t) => { if (t === FIRE_AT - 1) d.host!.disable(); });
    d.runTo(FIRE_AT + ticks(0.5));
    expect(d.host!.snapshot().state).toBe('off');
    const vanilla = duel(null);
    vanilla.runTo(FIRE_AT + ticks(0.5));
    expect(sum([...d.room.player(2)!.health.hp])).toBeLessThan(sum(fresh()));
    expect([...d.room.player(2)!.health.hp]).toEqual([...vanilla.room.player(2)!.health.hp]);
  });
});
