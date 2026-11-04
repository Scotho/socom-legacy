import type {RdrNode} from '@s2u/archive';
import {soundRdrFind as rdrGet} from '@s2u/sound';
import {fadd,fdiv,fmul} from '@s2u/ui';

export interface TacticalGroupDefinition {name:string;dynamic:number;members:{name:string;weight:number}[]}
/** ISO sounds.rdr GROUPS/MP_COMMON and HOSTAGE, loaded by FUN_00344910. Research 302. */
export function readTacticalSoundGroups(root:RdrNode,names:readonly string[],resolves:(name:string)=>boolean):TacticalGroupDefinition[] {
  const groups=rdrGet(root,'GROUPS'),out:TacticalGroupDefinition[]=[];
  if(!Array.isArray(groups))return out;
  for(const block of ['MP_COMMON','HOSTAGE']){
    const list=rdrGet(groups,block);if(!Array.isArray(list))continue;
    for(const row of list){
      if(!Array.isArray(row)||typeof row[0]!=='string'||!names.includes(row[0]))continue;
      const entries=rdrGet(row,'ENTRIES');if(!Array.isArray(entries))continue;
      const number=(node:RdrNode,key:string):number=>{const v=rdrGet(node,key);return Math.fround(Number(Array.isArray(v)?v[0]??0:v??0));};
      out.push({name:row[0],dynamic:number(row,'DYNAMIC_WEIGHTS'),members:entries.flatMap(e=>
        Array.isArray(e)&&typeof e[0]==='string'&&resolves(e[0])?[{name:e[0],weight:number(e,'WEIGHT')}]:[])});
    }
  }
  return out;
}
/** Native 347f00/347d40/348710/348450. Per-client group state, retained between menu uses. */
export class TacticalSoundGroup {
  private weights:number[];
  constructor(readonly definition:TacticalGroupDefinition){this.weights=definition.members.map(m=>Math.fround(m.weight));this.normalize();}
  private normalize():void {
    let sum=0;for(const w of this.weights)sum=fadd(sum,w);
    if(sum===0)this.weights.fill(fdiv(1,this.weights.length));
    else {const scale=fdiv(1,sum);this.weights=this.weights.map(w=>fmul(w,scale));}
  }
  pick(random:number):string|null {
    const sample=Math.fround(random);let cumulative=0;
    for(let i=0;i<this.weights.length;i++){
      cumulative=fadd(cumulative,this.weights[i]!);
      if(cumulative>sample){this.weights[i]=fmul(this.weights[i]!,this.definition.dynamic);this.normalize();return this.definition.members[i]!.name;}
    }
    return null;
  }
}
