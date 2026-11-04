import {expect,it} from 'vitest';
import {GRENADE_WARNING_ITEMS,grenadeWarningFor} from '../src/gameplayAudio';
import type {TauntData} from '../src/tauntData';
import {WebAudioOut} from '../src/audio';
import {RoundAudioHost} from '../src/roundAudioHost';
const voices={seal:[[{sound:'^SEAL',text:'%s',character:'seal'}]],terrorist:[[{sound:'^TERROR',text:'%s',character:'terror'}]]} satisfies TauntData['vocals'];
it('uses the original remote teammate automatic command, never own/enemy/spectator cues',()=>{
 for(const team of ['seal','terrorist'] as const){
  for(const weapon of [0x79,0x7a,0x7b,0x7e,0x7f,0x80])expect(grenadeWarningFor(voices,weapon,2,1,team,team,0)?.sound).toBe(team==='seal'?'^SEAL':'^TERROR');
  expect(grenadeWarningFor(voices,0x79,1,1,team,team,0)).toBeNull();
  expect(grenadeWarningFor(voices,0x79,2,1,null,team,0)).toBeNull();
  expect(grenadeWarningFor(voices,0x79,2,1,team,team==='seal'?'terrorist':'seal',0)).toBeNull();
 }
 for(const weapon of [0x99,0x9a,0xc1,-1,NaN])expect(grenadeWarningFor(voices,weapon,2,1,'seal','seal',0)).toBeNull();
 expect(grenadeWarningFor(voices,0x79,2,1,'seal','seal',7)).toBeNull();
 expect(grenadeWarningFor(undefined,0x79,2,1,'seal','seal',0)).toBeNull();
});

// NU-7 T1 (research 325 §2.1, §4 T1; a pin): the six ids FUN_005c5340 tests before command 0x26 (D:L479236-479237) --
// 0x79 M67, 0x7e HE, 0x7f red smoke, 0x80 chem light, 0x7a AN-M8, 0x7b Mark141 -- and no other.
it('GRENADE_WARNING_ITEMS is exactly the six hand grenades of D:L479236-479237',()=>{
 expect(GRENADE_WARNING_ITEMS).toHaveLength(6);
 expect([...GRENADE_WARNING_ITEMS].sort((a,b)=>a-b)).toEqual([0x79,0x7a,0x7b,0x7e,0x7f,0x80]);
});

it('cleans transient audio on a new round and disconnect reset, without replaying cues',()=>{
 const calls:string[]=[];
 const host=new RoundAudioHost({playMusic:()=>{calls.push('music');return 'played';},
  playStream:()=>{calls.push('voice');return 'played';},stopMusic:()=>{calls.push('stop music');},
  stopTransient:()=>{calls.push('stop transient');},roundCues:()=>null},()=>0);
 host.roundStart('seal',false);
 host.reset();host.reset();host.frame();
 expect(calls.filter(c=>c==='stop transient')).toHaveLength(3);
 expect(calls.filter(c=>c==='voice'||c==='music')).toEqual([]);
});

it('stops old gameplay bank/voice sources without stopping the music slot or replaying sources',()=>{
 const nodes:{starts:number;stops:number}[]=[];
 class Context {
  state='running';sampleRate=48000;currentTime=0;destination={};
  createGain(){return{gain:{value:1,setValueAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}};}
  createChannelSplitter(){return{connect(){},disconnect(){}};}
  createChannelMerger(){return{connect(){},disconnect(){}};}
  createBuffer(channels:number,length:number,rate:number){return{numberOfChannels:channels,length,sampleRate:rate,copyToChannel(){}};}
  createBufferSource(){const n=Object.assign(new EventTarget(),{starts:0,stops:0,onended:null,connect(){},disconnect(){},start(){this.starts++;},stop(){this.stops++;}});nodes.push(n);return n;}
 }
 const old=globalThis.AudioContext;Object.assign(globalThis,{AudioContext:Context});
 try{
  const out=new WebAudioOut();out.prepare();
  const sound={left:new Float32Array(8),right:new Float32Array(8),sendLeft:null,sendRight:null,sampleRate:48000,voices:1,samples:[],peak:0};
  const gains={left:[1,0] as [number,number],right:[0,1] as [number,number]};
  out.play(sound);out.playStream(sound,gains);out.playMusic(sound,0,gains);
  out.stopTransient();expect(nodes.map(n=>n.stops)).toEqual([1,1,0]);
  out.stopTransient();expect(nodes.map(n=>n.stops)).toEqual([1,1,0]);expect(nodes.map(n=>n.starts)).toEqual([1,1,1]);
 }finally{Object.assign(globalThis,{AudioContext:old});}
});
