import { existsSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { Zar, ZAR_HEAD, zarIndexLength } from '@s2u/archive';
import { decodeVagStream, decodeVpk, isPcm16Stream } from '@s2u/sound';
import { SOUND_STREAMS_PATH, soundFromDisc, soundTransferables, STREAM_PCM16_MAX_SECONDS_ADAPTATION } from '../src/soundData';

const disc = process.env.SOCOM_DISC;
const available = !!disc && existsSync(resolve(disc, SOUND_STREAMS_PATH));

it.skipIf(!available)('LATER 1229: every Frostfire stream sample exact; PCM16 under 10 s, floats at or over it; the saving measured', async () => {
  const source = new FsAssetSource(disc!);
  const ranged = Object.assign(source, {
    size: async (path: string) => {
      const file = await open(resolve(disc!, path));
      try { return (await file.stat()).size; } finally { await file.close(); }
    },
    readRange: async (path: string, offset: number, length: number) => {
      const file = await open(resolve(disc!, path));
      try {
        const bytes = new Uint8Array(length);
        let got = 0;
        while (got < length) {
          const read = await file.read(bytes, got, length - got, offset + got);
          if (!read.bytesRead) throw new Error('Truncated test asset');
          got += read.bytesRead;
        }
        return bytes;
      } finally { await file.close(); }
    },
  });
  const data = await soundFromDisc(ranged, 'RUN/MP2.ZDB', 'MP2');
  expect(data.streams!.length).toBeGreaterThan(6);
  const head = await ranged.readRange(SOUND_STREAMS_PATH, 0, ZAR_HEAD);
  const zar = Zar.parse(await ranged.readRange(SOUND_STREAMS_PATH, 0, zarIndexLength(head)));
  let floatBytes = 0, storedBytes = 0, longCount = 0, expectStored = 0;
  for (const stream of data.streams!) {
    const stored = stream.sound;
    const long = stored.left.length / stored.sampleRate >= STREAM_PCM16_MAX_SECONDS_ADAPTATION;
    expect(isPcm16Stream(stored), `${stream.name}: PCM16 iff under ${STREAM_PCM16_MAX_SECONDS_ADAPTATION} s`).toBe(!long);
    if (long) longCount++;
    const member = zar.root.children.find(k => k.name.toUpperCase() === stream.file.toUpperCase())!;
    const bytes = await ranged.readRange(SOUND_STREAMS_PATH, zar.dataOffset + member.offset, member.size);
    const normal = stream.file.toUpperCase().endsWith('.VPK') ? decodeVpk(bytes) : decodeVagStream(bytes);
    expect([stored.sampleRate, stored.voices, stored.peak, stored.samples, stored.sendLeft, stored.sendRight])
      .toEqual([normal.sampleRate, normal.voices, normal.peak, normal.samples, normal.sendLeft, normal.sendRight]);
    for (const side of ['left', 'right'] as const) {
      expect(stored[side].length).toBe(normal[side].length);
      for (let i = 0; i < stored[side].length; i++) {
        const v = isPcm16Stream(stored) ? stored[side][i]! / 32768 : stored[side][i]!;
        if (!Object.is(v, normal[side][i])) throw new Error(`${stream.name} ${side} sample ${i}`);
      }
    }
    const f = [...new Set([normal.left.buffer, normal.right.buffer])].reduce((n, b) => n + b.byteLength, 0);
    floatBytes += f;
    expectStored += long ? f : f / 2;                                  // floats kept whole; Int16 is half a float
    storedBytes += [...new Set([stored.left.buffer, stored.right.buffer])].reduce((n, b) => n + b.byteLength, 0);
  }
  // The saving, exactly: the short streams' Int16 halves; the long ones (the music) stay floats.
  expect(longCount).toBeGreaterThan(0);
  expect(storedBytes).toBe(expectStored);                           // the saving, to the byte
  console.info(`LATER 1229 MP2: ${data.streams!.length} streams, ${longCount} kept as floats; float ${floatBytes} B, stored ${storedBytes} B, saved ${floatBytes - storedBytes} B`);
  const transfer = soundTransferables(data);
  expect(new Set(transfer).size).toBe(transfer.length);
  const first = data.streams![0]!.sound.left;
  const copied = structuredClone(data, { transfer });
  expect(first.byteLength).toBe(0);
  expect(copied.streams!.some((x) => x.sound.left instanceof Int16Array)).toBe(true);
  console.info(JSON.stringify({ streams: copied.streams!.length, floatBytes, storedBytes, savedBytes: floatBytes - storedBytes }));
}, 60000);
