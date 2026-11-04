/** Metadata only: inspect the visitor's disc, never write sound bytes. Research 304.
 * SOCOM_DISC=<disc parent> node --import tsx tools/gameplay-audio-inventory.ts [MP2 MP51 MP72]
 * Redirect stdout to keep a readiness inventory for a future map. */
import { GameplayAudioSource } from './gameplayAudioSource';
import { parseBankFile } from '@s2u/sound';
import { soundFromDisc } from '../packages/viewer/src/soundData';
import {parseZdb, zdbTocLength, ZDB_HEAD, Zar} from '@s2u/archive';

if (!process.env.SOCOM_DISC) throw Error('SOCOM_DISC must name the parent of the locally extracted RUN');
const source = new GameplayAudioSource(process.env.SOCOM_DISC);
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['MP2', 'MP51', 'MP72'];
const report: unknown[] = [];
for (const map of maps) {
  if (!/^MP\d+$/.test(map)) throw Error('Expected an MP archive identifier');
  const data = await soundFromDisc(source, `RUN/${map}.ZDB`, map);
  const mapPath = `RUN/${map}.ZDB`;
  const toc = parseZdb(await source.readRange(mapPath, 0, zdbTocLength(await source.readRange(mapPath, 0, ZDB_HEAD))), await source.size(mapPath));
  const eventPaths = new Map<string,string[]>();
  for (const entry of toc.filter(e => /[\\/][CM]ZANIM\.ZAR$/i.test(e.name))) {
    const zar = Zar.parse(await source.readRange(mapPath,entry.offset,entry.size));
    for (const set of zar.find('Anim_Sets')?.children ?? []) {
      for (const event of zar.find(`Anim_Sets/${set.name}/Animation_List`)?.children ?? []) {
        const paths = eventPaths.get(event.name) ?? [];
        paths.push(`${mapPath} :: ${entry.name} :: Anim_Sets/${set.name}/Animation_List/${event.name}`);
        eventPaths.set(event.name, paths);
      }
    }
  }
  const banks = data.banks.map(b => ({ ...b, bank: parseBankFile(b.bytes) }));
  const assets = (name: string) => banks.flatMap(b => [...b.bank.names].flatMap(([n, index]) =>
    n.trim() === name && (!b.only || b.only.includes(n) || b.only.includes(n.trim())) ? [{
      path: `RUN/SOUNDS/BNKSTORE.ZAR :: ${b.file}`, bank: b.bank.name, index,
      volumeGroup: b.bank.sounds[index]!.volGroup, borrowed: !!b.only,
    }] : []));
  const callbacks = data.callbacks.map(([event, sounds]) => ({
    event, sources: eventPaths.get(event) ?? [],
    triggerEvidence: 'zAnim dependency only; native caller/timing must also be established',
    sounds: sounds.map((name, i) => ({ name, volume: data.callbackVolumes?.find(r => r[0] === event)?.[1][i] ?? 1,
      assets: assets(name), status: assets(name).length ? 'decoded; see trigger inventory' : 'missing in loaded banks' })),
  }));
  report.push({ map, confidence: 'reading; not an original-running comparison', missing: data.missing,
    weapons: data.weapons, materials: data.materials, callbacks, parameters: data.params,
    streams: data.streams?.map(s => ({name:s.name,path:`RUN/SOUNDS/VAGSTORE.ZAR :: ${s.file}`,group:s.group,
      seconds:s.sound.left.length/s.sound.sampleRate,decoded:s.sound.left.length>0})),
    grenadeWarnings: data.taunts?.grenadeWarnings, characterVoices: data.characterVoices,
    roundCues: data.roundCues, ambience:data.layers,emitters:data.emitters,
    bankEvents:banks.flatMap(b => [...b.bank.names].filter(([n])=>!b.only||b.only.includes(n)||b.only.includes(n.trim())).map(([name,index])=>({
      name,index,path:`RUN/SOUNDS/BNKSTORE.ZAR :: ${b.file}`,bank:b.bank.name,volumeGroup:b.bank.sounds[index]!.volGroup,
      borrowed:!!b.only,triggerStatus:'asset presence only; match to weapons/materials/callbacks and research 304',
    }))),
  });
}
console.log(JSON.stringify(report,null,2));
