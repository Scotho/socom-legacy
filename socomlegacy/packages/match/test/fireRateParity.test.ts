// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildGrid, GAME_FRAME_DT, readKitTable, type Grid, type WeaponRecord } from '@s2u/scene';
import * as accuracy from '../../viewer/src/accuracy';
import { Fire, type FireGun } from '../../viewer/src/fire';
import { TICK_HZ } from '../../viewer/src/net/protocol';
import { BotFirePolicy } from '../src/bots/roles';

/**
 * OBF-19 (Trello cFOg4UJu; simulation track, reading, pending review): every weapon's rate of fire, the original's against
 * the port's -- the page's own kit (`Fire`, the player's rounds) at 30, 60 and 144 fps, and the room's bots
 * (`BotFirePolicy`, on the room's 60 Hz tick) -- for each fire mode the weapon has.
 *
 * The original (a transcription, written here apart from the port's code so the two can disagree):
 * - the wait after a round is the record's `FireWait` (+0x50, seconds; research 94 C1), x 0.8 in burst and automatic
 *   (`FUN_005c09f0` D:L476323-476341), set on the kit's timer `kit+0x81c` when the round goes (`FUN_005be9a0` D:L475517, the firearm's branch from D:L475514);
 * - the kit's frame (`FUN_005c0fd0`) asks the gate first -- no round while the timer is above 0 (`FUN_005c0ae0`
 *   D:L476446-476448) -- then runs the timer down by the frame's dt and clamps it at 0 (D:L476643-476647): the leftover is
 *   dropped, so a round goes every ceil(wait / dt) frames;
 * - the frame is 525 H-blanks, 525 / 15734 s, the game capped at 30 Hz (`GAME_FRAME_DT`, research 180 s0, 208);
 * - the timer and dt are floats (single precision on the PS2's FPU): the run-down is done in float32.
 * So the original's shots a second are 1 / (frames x GAME_FRAME_DT) -- e.g. the HK5 in automatic: 0.08 s is 2.4 frames,
 * a round every 3 (9.99 a second), not 12.5. The fire timer alone: a bolt's or a pump's lock and its clip (the M40A1,
 * the M87ELR, the 870) hold it on top of this (research 84 s6, LATER 330), which neither side models here.
 *
 * The table is the disc's (`RUN/ZWEAPON.ZAR` through `readKitTable`, when `SOCOM_DISC` holds it), else its pin
 * (`scene/test/golden/weapon-records.json`, re-read whole off the disc by `weaponTable.parity.test.ts`).
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const ZWEAPON = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC, 'RUN/ZWEAPON.ZAR') : null;
const ON_DISC = ZWEAPON !== null && existsSync(ZWEAPON);
const TABLE = ON_DISC ? readKitTable(new Uint8Array(readFileSync(ZWEAPON!))) : null;
const RECORDS: WeaponRecord[] = TABLE ? [...TABLE.records.values()].sort((a, b) => a.id - b.id) : Object.values(PIN.records);
const SOURCE = ON_DISC ? `disc ${ZWEAPON}` : 'pin scene/test/golden/weapon-records.json (no SOCOM_DISC: the disc re-read skipped)';

const f32 = Math.fround;
/** `FUN_005c09f0`: the wait a mode sets, in float32 (mode 0: 1.0; 2 and 3: FireWait x 0.8; else FireWait). */
const originalWait = (fireWait: number, mode: number): number => (mode === 0 ? 1 : mode === 2 || mode === 3 ? f32(f32(fireWait) * f32(0.8)) : f32(fireWait));
/** The original's game frames from a round to the next: the timer set, run down a frame at a time, clamped at 0. */
function originalFrames(wait: number): number {
  const dt = f32(GAME_FRAME_DT);
  let w = f32(wait), n = 0;
  do { w = f32(w - dt); n++; } while (w > 0);
  return n;
}
/** The modes the table gives a weapon (a launcher carrier with none fires its FireWait: `FUN_005c09f0`'s mode >= 4). */
const modesOf = (rec: WeaponRecord): number[] => (rec.fireModes.length ? [...rec.fireModes] : [1]);

/** A wall 30 units down the aim (the page's kit fires no round without a hull to trace: `Fire.tryFire`). */
const WALL: Grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [],
  [{ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]) }],
  [{ modelName: 'worldmodel', path: 'worldmodel/q0', first: 0, count: 1 }]);

/** The page's kit (`Fire`) held for `seconds` at `fps` in `mode`: its rounds' times (s) after the press's round. */
function pageRounds(rec: WeaponRecord, mode: number, fps: number, seconds: number): number[] {
  const record: WeaponRecord = { ...rec, magazine: 100000, mags: 1 };
  const fire = new Fire({ grid: () => WALL, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, record, undefined, () => 0.5);
  const gun: FireGun = { trigger: () => {}, roundsPerPull: () => Infinity, interval: (w) => accuracy.fireInterval(w, mode), round: (d) => d };
  fire.setGun(gun);
  const at: number[] = [];
  if (fire.pull()) at.push(0);
  let t = 0;
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    t += 1 / fps;
    if (fire.update(1 / fps) > 0) at.push(t);
  }
  return at;
}

/** The page's semi-automatic: a press every page frame (released between) for `seconds` at `fps`: its rounds' times (s). */
function pageClicks(rec: WeaponRecord, fps: number, seconds: number): number[] {
  const fire = new Fire({ grid: () => WALL, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, { ...rec, magazine: 100000, mags: 1 }, undefined, () => 0.5);
  fire.setGun({ trigger: () => {}, roundsPerPull: () => 1, interval: (w) => accuracy.fireInterval(w, 1), round: (d) => d });
  const at: number[] = [];
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    if (fire.pull()) at.push(i / fps);
    fire.release();
    fire.update(1 / fps);
  }
  return at;
}

/** The room's bot held on `rec` in `mode` (its only mode) for `ticks`: its pulls, each the ticks its rounds went. */
function botPulls(rec: WeaponRecord, mode: number, ticks: number): number[][] {
  const policy = new BotFirePolicy(), record = { ...rec, fireModes: [mode] }, pulls: number[][] = [];
  let open = false;
  for (let tick = 0; tick < ticks; tick++) {
    const input = policy.update(record, 0, 'rusher', 50, 1000, tick, true);
    if (!input.trigger) open = false;
    if (input.due) {
      if (!open) pulls.push([]);
      open = true;
      pulls.at(-1)!.push(tick); policy.fired(tick);
    }
  }
  return pulls;
}

const gapsOf = (at: readonly number[]): number[] => at.slice(1).map((x, i) => x - at[i]!);
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

const FPS = [30, 60, 144] as const;
interface Row {
  id: number; name: string; mode: number; wait: number; frames: number; original: number;
  /** The page held: each fps's rounds' times (s, the press's at 0) and its steady rate (from the second round on). */
  held: Record<number, number[]>; page: Record<number, number>;
  /** The page's semi-automatic pressed every frame (single mode only): each fps's rounds' times and its rate. */
  clicks: Record<number, number[]>; mash: Record<number, number>;
  /** The bot: shots a second inside its pulls (NaN for single: one round a pull), its least gap between any two rounds
   * (ticks), and the worst drift of a pull's span from the original's frames (ticks). */
  bot: number; botMin: number; botDrift: number;
}
const ROWS: Row[] = [];
for (const rec of RECORDS) {
  for (const mode of modesOf(rec)) {
    const wait = originalWait(rec.fireWait, mode), frames = originalFrames(wait), each = frames * GAME_FRAME_DT * TICK_HZ;
    const held: Record<number, number[]> = {}, page: Record<number, number> = {}, clicks: Record<number, number[]> = {}, mash: Record<number, number> = {};
    const seconds = Math.max(6, 5 * frames * GAME_FRAME_DT);   // five rounds at least (the M82A1A's 63 frames)
    for (const fps of FPS) {
      held[fps] = pageRounds(rec, mode, fps, seconds);
      page[fps] = 1 / mean(gapsOf(held[fps]!.slice(1)));
      if (mode === 1) { clicks[fps] = pageClicks(rec, fps, seconds); mash[fps] = 1 / mean(gapsOf(clicks[fps]!)); }
    }
    // A carrier with no firearm mode (the MGL, the M79) is no bot's: `BotFirePolicy` picks mode 0 and pulls nothing.
    const pulls = rec.fireModes.length ? botPulls(rec, mode, 40 * TICK_HZ) : [], inside = pulls.flatMap((p) => gapsOf(p));
    ROWS.push({ id: rec.id, name: rec.name, mode, wait, frames, original: 1 / (frames * GAME_FRAME_DT), held, page, clicks, mash,
      bot: inside.length ? TICK_HZ / mean(inside) : NaN, botMin: pulls.length ? Math.min(...gapsOf(pulls.flat())) : NaN,
      botDrift: Math.max(0, ...pulls.map((p) => Math.abs((p.at(-1)! - p[0]!) - (p.length - 1) * each))) });
  }
}

describe(`OBF-19: every weapon's rate of fire, the original's against the port's (${SOURCE})`, () => {
  it("the table (printed): the original's game frames a round and shots a second; the page held and pressed every frame at 30/60/144 fps; the bot's", () => {
    const pct = (x: number, o: number): string => `${x >= o ? '+' : ''}${((x / o - 1) * 100).toFixed(1)}%`;
    const rate = (x: number | undefined, o: number): string => (x === undefined || Number.isNaN(x) ? '--' : `${x.toFixed(3)} (${pct(x, o)})`);
    const lines = ROWS.map((r) => [String(r.id).padStart(3), r.name.padEnd(17), `m${r.mode}`, r.wait.toFixed(4), `${String(r.frames).padStart(2)}f`,
      r.original.toFixed(3), ...FPS.map((fps) => rate(r.page[fps], r.original)), ...FPS.map((fps) => rate(r.mash[fps], r.original)),
      `${rate(r.bot, r.original)} least ${r.botMin}t`].join('  '));
    console.log(`id  name  mode  wait  frames  orig/s  held@30  held@60  held@144  pressed@30  pressed@60  pressed@144  bot (in a pull; least gap, ${TICK_HZ} Hz ticks)\n${lines.join('\n')}`);
    expect(ROWS.length).toBeGreaterThan(RECORDS.length);
  });

  it("the page's kit held: every weapon, every mode, at 30, 60 and 144 fps -- round j never before j original rounds' frames, never a page frame after", () => {
    const off: string[] = [];
    for (const r of ROWS) {
      const q = r.frames * GAME_FRAME_DT;
      for (const fps of FPS) {
        const at = r.held[fps]!, bad = at.findIndex((t, j) => !(t >= j * q - 1e-9 && t <= j * q + 1 / fps + 1e-9));
        if (at.length < 4 || bad >= 0) off.push(`${r.name} m${r.mode} @${fps}: ${at.length} rounds, round ${bad} at ${at[bad]?.toFixed(4)} against ${(bad * q).toFixed(4)}`);
      }
    }
    expect(off).toEqual([]);
  });

  // LATER 587 (reading, pending review): the original fires a pressed round on the frame its timer reads 0 (`FUN_005c0ae0`
  // D:L476446-476448; the release reset the count, D:L476381-476382, D:L476439), so a press every page frame fires every
  // ceil(wait / frame) game frames -- round j on the first page frame at or after j x those frames from the first, its
  // steady rate the original's. Was (OBF-19): each gap at least the frames and at most a page frame over, which let the
  // page's per-press clock restart (`Fire.pull`) wait a page frame a press: 2n + 1 page frames at 60 fps, -7.6% to -19.9%.
  it("the page's semi-automatic pressed every page frame: every weapon at 30, 60 and 144 fps -- round j never before j original rounds' frames, never a page frame after", () => {
    const off: string[] = [];
    for (const r of ROWS.filter((x) => x.mode === 1)) {
      const q = r.frames * GAME_FRAME_DT;
      for (const fps of FPS) {
        const at = r.clicks[fps]!, bad = at.findIndex((t, j) => !(t >= j * q - 1e-9 && t <= j * q + 1 / fps + 1e-9));
        if (at.length < 4 || bad >= 0) off.push(`${r.name} @${fps}: ${at.length} rounds, ${r.mash[fps]!.toFixed(3)}/s against ${r.original.toFixed(3)}; round ${bad} at ${at[bad]?.toFixed(4)} against ${(bad * q).toFixed(4)}`);
      }
    }
    expect(off).toEqual([]);
  });

  it("the room's bots fire every weapon in every mode at the original's rate on the 60 Hz tick: no gap a tick short of the original's frames, a pull's span within a tick of them", () => {
    const off = ROWS.filter((r) => !Number.isNaN(r.botMin)).filter((r) => !(r.botMin >= Math.floor(r.frames * GAME_FRAME_DT * TICK_HZ) && r.botDrift < 1))
      .map((r) => `${r.name} m${r.mode}: bot ${r.bot.toFixed(3)}/s, least gap ${r.botMin} ticks, drift ${r.botDrift.toFixed(2)} ticks; original ${r.original.toFixed(3)}/s (${r.frames} frames, ${(r.frames * GAME_FRAME_DT * TICK_HZ).toFixed(3)} ticks)`);
    expect(off).toEqual([]);
  });

  it('`fireFrames` (the port\'s one count of the original\'s frames a round) is the transcription for every weapon and mode', () => {
    const fireFrames = (accuracy as unknown as { fireFrames?: (fireWait: number, mode: number) => number }).fireFrames;
    expect(typeof fireFrames).toBe('function');
    expect(ROWS.filter((r) => fireFrames!(RECORDS.find((x) => x.id === r.id)!.fireWait, r.mode) !== r.frames).map((r) => `${r.name} m${r.mode}`)).toEqual([]);
  });
});
