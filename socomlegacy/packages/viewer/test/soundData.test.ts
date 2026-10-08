import { describe, expect, it } from 'vitest';
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZdb, Zar, zdbMember, type AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { parseAnimSets } from '@s2u/scene';
import { buildZar } from '../../scene/test/syntheticZar';
import { parseStreamEntries, soundHash, type RenderedSound } from '@s2u/sound';
import { GameAudio, type AudioOut } from '../src/audio';
import { RoundAudioHost } from '../src/roundAudioHost';
import {
  readSoundStreams, renderAmbienceLoops, SOUND_BANKS_PATH, SOUND_SCRIPT_PATH, SOUND_STREAMS_PATH, soundFromDisc, soundTransferables, type SoundData,
} from '../src/soundData';

const fixtures = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const script = resolve(fixtures, SOUND_SCRIPT_PATH);

/**
 * A bank that will not parse is named in `missing`, never thrown (research 81 §8: "`missing` names what could not be
 * read"; worker.ts: "Never an error either"): the params loop and the ambience render read bank by bank.
 */
describe.skipIf(!existsSync(script))('a bank that will not parse', () => {
  it('is named in missing, and the rest of the map sound still comes', async () => {
    const garbage = new Uint8Array(96).fill(0xab);
    const store = buildZar([{ name: 'MP2_am.bnk', data: garbage }]);
    const source: AssetSource = {
      list: async () => [],
      read: async (path: string) => {
        if (path === SOUND_BANKS_PATH) return store;
        if (path === SOUND_SCRIPT_PATH) return new Uint8Array(readFileSync(script));
        throw new Error(`no ${path}`);
      },
    };
    const d = await soundFromDisc(source, 'RUN/MP2.ZDB', 'MP2');
    expect(d.banks.map((b) => b.file)).toEqual(['MP2_am.bnk']);
    expect(d.missing.some((m) => /^MP2_am\.bnk: /.test(m))).toBe(true);
    expect(d.params).toEqual([]);
    expect(renderAmbienceLoops({ ...d, beds: { outside: ['~OUTDOOR_AMB'], inside: [] } }, 1, 0.1)).toEqual([]);
  });
});

/**
 * Research 124 §4: the round's cue names to their VAGSTORE members, read in one batch by range (the index once, then
 * each member) and decoded in the worker. A source that cannot read by range is refused: VAGSTORE is 577 MB, and the
 * whole-archive fallback of `readZarMembers` would read all of it. Synthetic streams and script.
 */
describe('the round\'s streams out of VAGSTORE (research 124 §4)', () => {
  const vpk = (): Uint8Array => {
    const b = new Uint8Array(0x800 + 64), v = new DataView(b.buffer);
    b.set([0x20, 0x4b, 0x50, 0x56]);
    v.setUint32(4, 32, true); v.setUint32(8, 0x800, true); v.setUint32(12, 32, true); v.setUint32(16, 32000, true); v.setUint32(20, 2, true);
    for (let k = 0; k < 4; k++) b[0x800 + k * 16] = 0x0c;
    return b;
  };
  const vagp = (): Uint8Array => {
    const b = new Uint8Array(48 + 32), v = new DataView(b.buffer);
    b.set([0x56, 0x41, 0x47, 0x70]); v.setUint32(12, 32, false); v.setUint32(16, 22050, false);
    b[48] = 0x0c; b[64] = 0x0c; b[65] = 1;
    return b;
  };
  const entries = parseStreamEntries(['SETS', [
    'SMUS', [[String(soundHash('MUS_MP_SEAL_WIN_RUS')), 'ST', ['N1', ['MUMP0019']], 'MUS', []]],
    'MULTI', [[String(soundHash('^PH_0014')), 'ST', ['N1', ['PH_0014']]]],
  ]]);
  const store = buildZar([{ name: 'MUMP0019.vpk', data: vpk() }, { name: 'PH_0014.vag', data: vagp() }, { name: 'OTHER.vag', data: vagp() }]);
  const reads: [number, number][] = [];
  const ranged: AssetSource & { size(p: string): Promise<number>; readRange(p: string, o: number, n: number): Promise<Uint8Array> } = {
    list: async () => [],
    read: async () => { throw new Error('read whole'); },
    size: async () => store.length,
    readRange: async (_p, o, n) => { reads.push([o, n]); return store.slice(o, o + n); },
  };

  it('resolves each name through the blocks the map loads, reads the members by range and decodes them', async () => {
    const missing: string[] = [];
    const got = await readSoundStreams(ranged, entries, 'MP2', ['MUS_MP_SEAL_WIN_RUS', '^PH_0014', '^PH_9999'], missing);
    expect(got.map((s) => [s.name, s.file, s.sound.sampleRate, s.sound.left.length])).toEqual([
      ['MUS_MP_SEAL_WIN_RUS', 'MUMP0019.VPK', 32000, 56], ['^PH_0014', 'PH_0014.VAG', 22050, 56],
    ]);
    expect(missing).toEqual([`${SOUND_STREAMS_PATH}: ^PH_9999 is no stream of the blocks MP2 loads`]);
    // The head, the index, then the two members: nothing else of the archive.
    expect(reads.length).toBe(4);
    // Each buffer once: the VPK's two channels, and the VAGp's one array for both (`decodeVagStream`, PR #631).
    expect(soundTransferables({ ...silentData(), streams: got }).length).toBe(3);
  });

  it('refuses a source that reads only whole files, and names a member the archive lacks', async () => {
    const missing: string[] = [];
    const whole: AssetSource = { list: async () => [], read: async () => store };
    expect(await readSoundStreams(whole, entries, 'MP2', ['^PH_0014'], missing)).toEqual([]);
    expect(missing).toEqual([`${SOUND_STREAMS_PATH}: not read by range; the round's streams are left out`]);
    const lacking = buildZar([{ name: 'OTHER.vag', data: vagp() }]);
    const m2: string[] = [];
    const src = { ...ranged, size: async () => lacking.length, readRange: async (_p: string, o: number, n: number) => lacking.slice(o, o + n) };
    expect(await readSoundStreams(src, entries, 'MP2', ['^PH_0014'], m2)).toEqual([]);
    expect(m2).toEqual([`${SOUND_STREAMS_PATH}: no PH_0014.VAG`]);
  });
});

function silentData(): SoundData {
  return {
    archive: 'MP2', banks: [], materials: [], params: [], weapons: [], callbacks: [], defaultMaterial: 0,
    beds: { outside: [], inside: [] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, missing: [],
  };
}

/** Research 124 on the dev disc (SOCOM_DISC): Frostfire's round, from its script to its decoded streams, read by range. */
const DISC = process.env.SOCOM_DISC;
const HAVE_STREAMS = !!DISC && existsSync(resolve(DISC, 'RUN/SOUNDS/VAGSTORE.ZAR')) && existsSync(resolve(DISC, 'RUN/MP2.ZDB'));

describe.skipIf(!HAVE_STREAMS)('round streams on the dev disc (SOCOM_DISC; research 124/304)', () => {
  /** The disc's tree, read by range (the page's sources do; a directory source alone does not). */
  const disc = (): AssetSource & { size(p: string): Promise<number>; readRange(p: string, o: number, n: number): Promise<Uint8Array> } => {
    const root = resolve(DISC ?? '');
    return {
      list: async () => [],
      read: async (p) => new Uint8Array(readFileSync(resolve(root, p))),
      size: async (p) => statSync(resolve(root, p)).size,
      readRange: async (p, o, n) => {
        const fd = openSync(resolve(root, p), 'r');
        try { const b = new Uint8Array(n); readSync(fd, b, 0, n, o); return b; } finally { closeSync(fd); }
      },
    };
  };

  it('reads the six cues the script names, decodes them, and the page plays them', async () => {
    const d = await soundFromDisc(disc(), 'RUN/MP2.ZDB', 'MP2');
    expect(d.roundCues?.map).toBe('MP2');
    // Original MULTI resolves this member but VAGSTORE lacks its file. Do not replace it
    // or remove it from the weighted group. That character's Defuse entry is unsupported.
    expect(d.missing.filter((m) => m.includes('VAGSTORE') || /\.(VPK|VAG):/.test(m))).toEqual([
      `${SOUND_STREAMS_PATH}: no PT_0263B.VAG`,
    ]);
    // This test holds the six round cues; tauntData.test separately holds the added character vocal streams.
    const tacticalLeaves=new Set(d.tacticalGroups?.flatMap(g=>g.members.map(m=>m.name)));
    for(const vocal of [...d.taunts!.tactical!.seal.flat(),...d.taunts!.tactical!.terrorist.flat()]){
      expect(vocal).not.toBeNull();
      const group=d.tacticalGroups?.find(g=>g.name===vocal!.sound);
      const members=group?.members??[{name:vocal!.sound}];expect(members.length,vocal!.sound).toBeGreaterThan(0);
      for(const member of members)expect(d.streams?.some(s=>s.name===member.name&&s.sound.peak>0),member.name).toBe(member.name!=='^*PT_0263B');
    }
    expect(d.streams?.filter(s => !/^\^\*?P[STO]_/.test(s.name)&&!tacticalLeaves.has(s.name)).map((s) => `${s.name} ${s.file}`).sort()).toEqual([
      'MUS_MP_SEAL_INTRO_4 MUMP0004.VPK', 'MUS_MP_SEAL_WIN_RUS MUMP0019.VPK', 'MUS_MP_TERR_INTRO_4 MUMP0009.VPK',
      'MUS_MP_TERR_WIN_RUS MUMP0020.VPK', '^PH_0002 PH_0002.VAG', '^PH_0014 PH_0014.VAG',
    ]);
    for (const s of d.streams ?? []) expect([s.sound.sampleRate, s.sound.peak > 0]).toEqual([s.file.endsWith('VPK') ? 32000 : 22050, true]);
  }, 120_000);

  for (const map of ['MP61', 'MP62', 'MP73']) {
    it.skipIf(!DISC || !existsSync(resolve(DISC, `RUN/${map}.ZDB`)))(`${map}: breach-success group loads its original voices and plays before the music`, async () => {
      // Reading, pending review (research 304 section 8): SOUNDRDR GROUPS/MP_COMMON and each MZANIM objectives.
      const d = await soundFromDisc(disc(), `RUN/${map}.ZDB`, map);
      const names = ['^PH_0024', '^PH_0025', '^PH_0026'];
      expect(d.tacticalGroups?.find(g => g.name === '^*PT_0024')).toEqual({
        name: '^*PT_0024', dynamic: Math.fround(.05), members: names.map(name => ({ name, weight: 0 })),
      });
      expect(d.missing.filter(m => m.includes('^*PT_0024'))).toEqual([]);
      const leaves = d.streams!.filter(s => names.includes(s.name));
      expect(leaves.map(s => [s.name, s.file, s.sound.sampleRate, s.sound.left.length, s.sound.peak > 0])).toEqual([
        ['^PH_0024', 'PH_0024.VAG', 22050, 100940, true],
        ['^PH_0025', 'PH_0025.VAG', 22050, 88256, true],
        ['^PH_0026', 'PH_0026.VAG', 22050, 67788, true],
      ]);
      expect(d.streams!.some(s => s.name === '^*PT_0024')).toBe(false); // a group, never a fabricated stream
      if (map !== 'MP73') expect(d.missing).toContain(`${SOUND_STREAMS_PATH}: ^PT_0242 is no stream of the blocks ${map} loads`);
      const musicName = map === 'MP73' ? 'MUS_MP_SEAL_WIN_ALG' : 'MUS_MP_SEAL_WIN_BRA';
      for (const [index, team] of (['seal', 'terrorist', null] as const).entries()) {
        const steps = d.roundCues!.bomb!.detonated.seal[team === 'seal' ? 0 : team === 'terrorist' ? 8 : 16];
        expect(steps).toBeDefined();
        expect(steps!.filter(s => 'sound' in s || 'wait' in s)).toEqual([
          { sound: '^*PT_0024', slot: false }, { wait: 2 }, { sound: musicName, slot: true },
        ]);
        let now = 0;
        const heard: { at: number; name: string | undefined; slot: string }[] = [];
        const record = (slot: string, sound: RenderedSound): void => {
          heard.push({ at: now, name: d.streams!.find(s => s.sound === sound)?.name, slot });
        };
        const out: AudioOut = {
          unlocked: true, state: 'running', unlock: () => undefined, setGain: () => undefined,
          play: sound => record('effect', sound), setReverb: () => undefined, rampReverb: () => undefined, loop: () => null,
          playStream: sound => record('voice', sound), playMusic: sound => record('music', sound), stopMusic: () => undefined,
        };
        // Real stream/group/round data, with bank and ambience output omitted from this stream-only harness.
        const audio = new GameAudio(out, () => .1 + index * .4, { now: () => now });
        audio.setData({ ...silentData(), archive: map, streams: d.streams, tacticalGroups: d.tacticalGroups, roundCues: d.roundCues });
        const host = new RoundAudioHost(audio, () => now);
        host.roundStart(team, false);
        now = 20;
        host.bomb('detonated', 'seal', team);
        host.bomb('detonated', 'seal', team); // repeated result must not duplicate the voice or music
        expect(heard).toEqual([{ at: 20, name: names[index], slot: 'voice' }]);
        now = 21.999;
        host.frame();
        expect(heard).toHaveLength(1);
        now = 22;
        host.frame();
        host.frame();
        expect(heard).toEqual([
          { at: 20, name: names[index], slot: 'voice' }, { at: 22, name: musicName, slot: 'music' },
        ]);
        expect(audio.stats().dropped.unknown).toBe(0);
      }
    }, 120_000);
  }
});

/**
 * PAR-92 B3 (research 319 §3 D5, §4.1 B3): the two zAnim archives are read each on its own, so a mission archive the
 * reader refuses costs only the mission set -- the common set's callbacks stay. The port's own error handling (the
 * original refuses no archive, research 319 §1.1): it changes no value. Frostfire's fixture, its `MZANIM.ZAR` made
 * unreadable (its `Anim_Set_Count` written 99, which `parseAnimSets` refuses).
 */
const mp2Zdb = resolve(fixtures, 'RUN/MP2.ZDB');
// The sound banks (`RUN/SOUNDS/BNKSTORE.ZAR`, MANIFEST's git-ignored copy by `npm run extract-maps`): without them
// `soundFromDisc` returns silent before it reads the zAnims, so the case has nothing to name -- it skips, and says so
// (checkpoint 12's gate, 2026-10-14: a tree without the copy failed it; was: skipped only without MP2.ZDB or the script).
const bankStore = resolve(fixtures, 'RUN/SOUNDS/BNKSTORE.ZAR');
describe.skipIf(!existsSync(mp2Zdb) || !existsSync(script) || !existsSync(bankStore))('a mission zAnim archive the reader refuses (PAR-92 B3; needs RUN/SOUNDS/BNKSTORE.ZAR)', () => {
  it("costs the mission set only: the common set's callbacks are kept, and the refusal is named", async () => {
    const whole = new Uint8Array(readFileSync(mp2Zdb));
    const broken = whole.slice();
    const entry = parseZdb(broken).find((e) => /(^|[\\/])MZANIM\.ZAR$/i.test(e.name))!;
    const zar = Zar.parse(broken.subarray(entry.offset, entry.offset + entry.size));
    const count = zar.child(zar.root, 'Anim_Set_Count')!;
    new DataView(broken.buffer).setUint32(entry.offset + zar.dataOffset + count.offset, 99, true);
    const fs = new FsAssetSource(fixtures);
    const source = (zdb: Uint8Array): AssetSource => ({
      list: async () => [],
      read: async (path: string) => (path === 'RUN/MP2.ZDB' ? zdb : fs.read(path)),
    });
    const good = await soundFromDisc(source(whole), 'RUN/MP2.ZDB', 'MP2');
    const d = await soundFromDisc(source(broken), 'RUN/MP2.ZDB', 'MP2');
    expect(d.missing.some((m) => /MZANIM\.ZAR/.test(m) && /Anim_Set_Count 99/.test(m))).toBe(true);
    expect(d.missing.some((m) => / zAnims: /.test(m))).toBe(false);
    // The common set's callbacks (CZANIM.ZAR's animations) are all there; only the mission set's are gone.
    const common = new Set(parseAnimSets(Zar.parse(zdbMember(whole, parseZdb(whole), 'CZANIM.ZAR'))).sets.flatMap((s) => s.anims.map((a) => a.name)));
    const commonCallbacks = good.callbacks.filter(([name]) => common.has(name));
    expect(commonCallbacks.length).toBeGreaterThan(0);
    expect(d.callbacks.filter(([name]) => common.has(name))).toEqual(commonCallbacks);
    expect(d.roundCues ?? null).toBeNull();
  }, 120_000);
});
