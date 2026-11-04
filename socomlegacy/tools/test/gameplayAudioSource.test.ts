import {afterEach, expect, it} from 'vitest';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, parse, relative} from 'node:path';
import {GameplayAudioSource} from '../gameplayAudioSource';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, {recursive:true, force:true}); });

it('reads ranges from a filesystem-root disc without adding a second separator', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'audio-source-')); directories.push(directory);
 const file = join(directory, 'sample.bin'); await writeFile(file, new Uint8Array([11,22,33,44]));
 const root = parse(file).root, source = new GameplayAudioSource(root), path = relative(root,file);
 expect(await source.size(path)).toBe(4);
 expect(await source.readRange(path,1,2)).toEqual(new Uint8Array([22,33]));
});

it('still refuses traversal and an absolute path outside a supplied directory', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'audio-source-')); directories.push(directory);
 const source = new GameplayAudioSource(directory);
 for (const path of ['../outside.bin', join(directory+'-other', 'sample.bin')]) {
  await expect(source.size(path)).rejects.toThrow('Disc path outside supplied directory');
  await expect(source.readRange(path,0,1)).rejects.toThrow('Disc path outside supplied directory');
 }
});
