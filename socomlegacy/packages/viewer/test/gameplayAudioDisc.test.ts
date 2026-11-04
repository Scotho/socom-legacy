import {describe,expect,it} from 'vitest';
import {existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {GameplayAudioSource} from '../../../tools/gameplayAudioSource';
import {parseBankFile,renderSound,SampleCache} from '@s2u/sound';
import {soundFromDisc} from '../src/soundData';
import {selectValidationMaps} from '../../../tools/mapValidation';
const disc=process.env.SOCOM_DISC;
const maps=disc&&existsSync(join(disc,'RUN'))?selectValidationMaps(readdirSync(join(disc,'RUN')).map(n=>'RUN/'+n)):['no-disc'];
describe.skipIf(!disc)('all-map original grenade warning readiness (separate from broader audio gaps)',()=>{
 for(const map of maps)it(`${map}: each team's four character mappings resolve to original warning samples`,async()=>{
  const d=await soundFromDisc(new GameplayAudioSource(disc!),`RUN/${map}.ZDB`,map);
  for(const side of ['seal','terrorist'] as const){
   expect(d.taunts?.grenadeWarnings?.[side]).toHaveLength(4);
   for(const [character,voices] of d.taunts!.grenadeWarnings![side].entries()){
    expect(voices.length).toBeGreaterThan(0);
    for(const voice of voices){
     expect(voice,`${side}/${character}`).not.toBeNull();
     const group=d.tacticalGroups?.find(g=>g.name===voice!.sound);
     const names=group?group.members.map(m=>m.name):[voice!.sound];
     expect(names.length).toBeGreaterThan(0);
     for(const name of names){
      const stream=d.streams?.find(s=>s.name===name);expect(stream,`${side}/${character}/${name}`).toBeDefined();
      expect(stream!.sound.left.length).toBeGreaterThan(0);expect(stream!.sound.peak).toBeGreaterThan(0);
     }
    }
   }
  }
 },30000);
});
describe.skipIf(!disc||!existsSync(join(disc,'RUN/SOUNDS/BNKSTORE.ZAR')))('gameplay audio map readiness, local disc',()=>{
 for(const map of ['MP2','MP51','MP72'])it(`${map}: original grenade effects and all team/character warning streams resolve`,async()=>{
  const d=await soundFromDisc(new GameplayAudioSource(disc!),`RUN/${map}.ZDB`,map);
  const callbacks=new Map(d.callbacks);
  expect(callbacks.get('frag_start')).toEqual(['.THROW_OBJECT']);
  expect(callbacks.get('HE_start')).toEqual(['.THROW_OBJECT']);
  expect(callbacks.get('frag_grenade')).toEqual(['.GREN_MED']);
  expect(callbacks.get('smoke_grenade')).toEqual(['!SMK_CANISTER']);
  expect(callbacks.get('flashcrash_grenade')).toEqual(['.MARK_141_FLASH']);
  expect(callbacks.get('throw_whoosh')).toEqual(['.MALE_GRUNT']);
  const owned=d.banks.filter(b=>!b.only).map(b=>parseBankFile(b.bytes));
  for(const name of ['.THROW_OBJECT','.GREN_MED','!SMK_CANISTER','.MARK_141_FLASH','.PLACE_CHARGE','.MALE_GRUNT']){
   const bank=owned.find(b=>[...b.names.keys()].some(n=>n.trim()===name));expect(bank,name).toBeDefined();
   const index=[...bank!.names].find(([n])=>n.trim()===name)![1];
   const sound=renderSound(bank!,index,new SampleCache(bank!.vag));
   expect(sound.left.length,name).toBeGreaterThan(0);expect(sound.peak,name).toBeGreaterThan(0);
  }
  expect(d.banks.flatMap(b=>b.only??[]).filter(n=>n.startsWith('.GREN_'))).toEqual([]);
  for(const side of ['seal','terrorist'] as const){
   expect(d.taunts?.grenadeWarnings?.[side]).toHaveLength(4);
   for(const voice of d.taunts!.grenadeWarnings![side].flat()){
    expect(voice).not.toBeNull();const group=d.tacticalGroups?.find(g=>g.name===voice!.sound);
    const names=group?group.members.map(m=>m.name):[voice!.sound];expect(names.length).toBeGreaterThan(0);
    for(const name of names){const stream=d.streams?.find(s=>s.name===name);expect(stream,name).toBeDefined();expect(stream!.sound.left.length).toBeGreaterThan(0);}
   }
  }
  // This preexisting taunt archive gap is not hidden or replaced with another recording.
  expect(d.missing).toEqual(map==='MP2'?['RUN/SOUNDS/VAGSTORE.ZAR: no PT_0263B.VAG']:[]);
 },30000);
});
