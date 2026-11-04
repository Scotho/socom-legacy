import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { readTauntData } from '../src/tauntData';
import { readSoundStreams, soundFromDisc } from '../src/soundData';
import { open, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseRdr, readZarMembers } from '@s2u/archive';
import { missionSoundBlocks, parseStreamEntries, streamFile, streamFor } from '@s2u/sound';
import { readTacticalSoundGroups } from '../src/tacticalSounds';
import { GameplayAudioSource } from '../../../tools/gameplayAudioSource';
describe.skipIf(!process.env.SOCOM_DISC)('ISO-extracted taunt records (reading, research 301)', () => {
  it('Vigilance terrorist TAUNT2 is the original starred direct stream, not an inferred group', async () => {
    const source = new GameplayAudioSource(process.env.SOCOM_DISC!);
    // RUN/MP51.ZDB :: READERM.ZAR/chartype.rdr -> RUN/READERC.ZAR ::
    // character.rdr mp51_terror1 sounds/multiplayer CMD_MP_TAUNT2.
    const data = await readTauntData(source, 'RUN/MP51.ZDB');
    const vocal = data.vocals.terrorist[0]![1]!;
    expect(vocal).toMatchObject({ character: 'mp51_terror1', sound: '^*PT_0124' });
    const bytes = (await readZarMembers(source, 'RUN/SOUNDRDR.ZAR', ['sounds.rdr'])).get('sounds.rdr');
    expect(bytes).toBeDefined();
    const script = parseRdr(bytes!);
    expect(readTacticalSoundGroups(script, [vocal.sound], () => true)).toEqual([]);
    const entry = streamFor(parseStreamEntries(script), missionSoundBlocks('MP51'), vocal.sound);
    expect(entry).toMatchObject({ block: 'MULTI', n1: 'PT_0124', music: false, loop: false, efx: false });
    expect(streamFile(entry!)).toBe('PT_0124.VAG');
    // The stream reader resolves the archive's filename case and decodes only
    // this original VAGSTORE member through ranged reads.
    const missing: string[] = [];
    const recordings = await readSoundStreams(source, parseStreamEntries(script), 'MP51', [vocal.sound], missing);
    expect(missing).toEqual([]); expect(recordings).toHaveLength(1);
    expect(recordings[0]).toMatchObject({ name: '^*PT_0124', file: 'PT_0124.VAG' });
    expect(recordings[0]!.sound.left.length).toBeGreaterThan(0);
    expect(recordings[0]!.sound.peak).toBeGreaterThan(0);
  });
  it('loads original vocal streams with their MULTI range overrides', async () => {
    const source = Object.assign(new FsAssetSource(process.env.SOCOM_DISC!), {
      size: async (path: string): Promise<number> => (await stat(resolve(process.env.SOCOM_DISC!, path))).size,
      readRange: async (path: string, offset: number, length: number): Promise<Uint8Array> => {
        const file = await open(resolve(process.env.SOCOM_DISC!, path), 'r');
        try { const bytes = new Uint8Array(length); const read = await file.read(bytes, 0, length, offset); if (read.bytesRead !== length) throw Error(`short read: ${path}`); return bytes; }
        finally { await file.close(); }
      },
    });
    const data = await soundFromDisc(source, 'RUN/MP2.ZDB', 'MP2');
    const names = [...new Set(Object.values(data.taunts!.vocals).flat(2).filter(v => v !== null).map(v => v.sound))];
    expect(names.length).toBeGreaterThan(7);
    for (const name of names) {
      expect(data.params.find(([key]) => key === name)?.[1], name).toMatchObject({ range: [120, 300] });
      expect(data.streams?.some(s => s.name === name), name).toBe(true);
    }
  }, 120000);
  it('reads defaults and every multiplayer mapping, explicitly recording the three missing first-taunt rows', async () => {
    const source = new FsAssetSource(process.env.SOCOM_DISC!);
    const maps = (await source.list()).filter(p => /^RUN\/MP\d+\.ZDB$/i.test(p));
    expect(maps.length).toBeGreaterThan(20);
    const unresolved: string[] = [];
    for (const map of maps) {
      const data = await readTauntData(source, map);
      expect(data.defaults).toEqual(['THIS IS THE END FOR YOU', 'COME GET SOME!', 'CAN YOU FEEL THE LOVE? IT FEELS LIKE BULLETS', "DON'T LET THE DOOR HIT YOU.", 'YOU NEED TO READ THE PIZANTS, MY HOME SKILLET']);
      expect(data.holdSeconds).toBe(0.3);
      expect([data.scroll, data.select, data.complete]).toEqual(['.TCM_SLIDE', '.TCM_SELECT', '.TCM_SELECT']);
      for (const side of ['seal', 'terrorist'] as const) for (const [index, character] of data.vocals[side].entries()) {
        expect(character, `${map} ${side}`).toHaveLength(7);
        character.forEach((v, n) => {
          if (!v) unresolved.push(`${map}:${side}:${index}:${n}`);
          else { expect(v.sound.startsWith('^'), `${map} ${side}`).toBe(true); expect(v.text).not.toMatch(/^_/); }
        });
      }
    }
    // Direct reread: character.rdr mp_seal6 sounds/multiplayer omits CMD_MP_TAUNT1; never fill it with another voice.
    expect(unresolved.sort()).toEqual(['RUN/MP71.ZDB:seal:3:0', 'RUN/MP72.ZDB:seal:3:0', 'RUN/MP73.ZDB:seal:3:0']);
  }, 120000);
});
