import {Button,TICK_HZ,type Command} from '../../../viewer/src/net/protocol';
import type {MoverSim} from '../../../viewer/src/net/moverSim';
import {Traversal} from '../../../viewer/src/traversal';
import {CLIMBABLE,type ClimbClass} from '../../../viewer/src/climb';
import {SEAL_TUNING_DEFAULTS} from '../../../viewer/src/physics';
import {MAX_YAW_RATE} from '../../../viewer/src/look';
import {RUNNING_JUMP_SPEED} from '../../../viewer/src/mover';
import {shortTurn,wrapYaw} from '../../../viewer/src/yaw';
import type {Point} from './navigationShape';

export interface BotClimbLink {entry:Point;exit:Point;yaw:number;path:string;kind:ClimbClass}
/** Authored pad policy (OT.R81). Native offer, clips, root motion, hang and landing remain authoritative. */
const CLIMB_INPUT_ADAPTATION={alignDegrees:2,entryTolerance:0.25,entrySpeed:1,approachGain:0.15,approachDamping:0.03,timeoutTicks:20*TICK_HZ,runup:16};
export class BotClimbDrive {
 private body:MoverSim|null=null;
 private approached=false;
 private engaged=false;
 private pressed=false;
 private invalid=false;
 private refusedContact=0;
 private jumped=false;
 private airborneSeen=false;
 private runup:Point|null=null;
 private running=false;
 constructor(readonly link:BotClimbLink,private readonly started:number,private readonly canExit:(at:Point,to:Point)=>boolean){}
 invalidate():void{this.invalid=true;}
 step(sim:MoverSim,tick:number):{command:Command|null;done:boolean;failed:boolean}{
  if(this.body&&this.body!==sim)return {command:null,done:true,failed:true};this.body=sim;
  const moves=sim.moves instanceof Traversal?sim.moves:null,s=sim.walker.state;
  const at:Point=[s.x,s.y,s.z],native=moves?.state(),busy=moves?.busy()??false;
  const climbing=!!native&&['climb','climbAlign','hang','hangUp','hangDown','hangDropFall'].includes(native.kind);
  this.engaged ||= climbing;
  const expired=tick-this.started>=CLIMB_INPUT_ADAPTATION.timeoutTicks;
  if(expired)this.invalid=true;
  const command=(forward=0,right=0,buttons=0,turn=0):Command=>({seq:sim.seq+1,yaw:wrapYaw(s.yaw+turn),pitch:0,
   turn:turn*Math.PI/180*TICK_HZ,buttons,stance:0,weapon:sim.weapon,forward,right});
  if(!moves)return {command:command(),done:true,failed:true};
  if(this.engaged&&!busy&&!sim.walker.airborne)return {command:command(),done:true,failed:this.invalid||Math.abs(s.y-this.link.exit[1])>SEAL_TUNING_DEFAULTS.step_height||!this.canExit(at,this.link.exit)};
  // Invalidation must not hand a native hang/climb to combat or a lateral recovery input.
  if(this.engaged)return {command:command(climbing?1:0),done:false,failed:false};
  if(this.invalid)return {command:command(),done:true,failed:true};
  const error=shortTurn(s.yaw,this.link.yaw),limit=MAX_YAW_RATE*180/Math.PI/TICK_HZ;
  const turn=Math.max(-limit,Math.min(limit,error)),aligned=Math.abs(error)<=CLIMB_INPUT_ADAPTATION.alignDegrees;
  if(sim.walker.stance==='prone')return {command:command(0,0,Button.Stance,turn),done:false,failed:false};
  if(!this.approached){
   const dx=this.link.entry[0]-s.x,dz=this.link.entry[2]-s.z;
   if(Math.hypot(dx,dz)<=CLIMB_INPUT_ADAPTATION.entryTolerance&&Math.hypot(s.vx,s.vz)<=CLIMB_INPUT_ADAPTATION.entrySpeed)this.approached=true;
   else{
    const yaw=(s.yaw+turn)*Math.PI/180,fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
    const stick=(x:number,z:number)=>Math.max(-1,Math.min(1,(dx*x+dz*z)*CLIMB_INPUT_ADAPTATION.approachGain-(s.vx*x+s.vz*z)*CLIMB_INPUT_ADAPTATION.approachDamping));
    return {command:command(aligned?stick(fx,fz):0,aligned?stick(rx,rz):0,0,turn),done:false,failed:false};
   }
  }
  const prompt=moves.climbPrompt();
  if(aligned&&prompt?.visible&&!this.pressed){
   this.pressed=!prompt.automatic;
   return {command:command(1,0,prompt.automatic?0:Button.Action,turn),done:false,failed:false};
  }
  if(this.jumped){
   this.airborneSeen ||= sim.walker.airborne;
   if(this.airborneSeen&&!sim.walker.airborne&&!busy)return {command:command(),done:true,failed:true};
   return {command:command(aligned?1:0,0,Button.ActionHeld,turn),done:false,failed:false};
  }
  if(this.runup){
   if(!this.running){
    const dx=this.runup[0]-s.x,dz=this.runup[2]-s.z;
    if(Math.hypot(dx,dz)<=CLIMB_INPUT_ADAPTATION.entryTolerance&&Math.hypot(s.vx,s.vz)<=CLIMB_INPUT_ADAPTATION.entrySpeed)this.running=true;
    else {
     const yaw=this.link.yaw*Math.PI/180,fx=-Math.sin(yaw),fz=-Math.cos(yaw);
     const stick=Math.max(-1,Math.min(1,(dx*fx+dz*fz)*CLIMB_INPUT_ADAPTATION.approachGain-(s.vx*fx+s.vz*fz)*CLIMB_INPUT_ADAPTATION.approachDamping));
     return {command:command(stick,0,0,turn),done:false,failed:false};
    }
   }
   const yaw=this.link.yaw*Math.PI/180,toward=-Math.sin(yaw)*s.vx-Math.cos(yaw)*s.vz;
   if(toward>=RUNNING_JUMP_SPEED){this.jumped=true;return {command:command(1,0,Button.Jump|Button.ActionHeld,turn),done:false,failed:false};}
   return {command:command(1,0,0,turn),done:false,failed:false};
  }
  // The move's contact is consumed by Traversal on its next tick. Do not reject the first wall-hit frame.
  this.refusedContact=aligned&&!busy&&!prompt&&sim.walker.wallHits().some(hit=>hit.poly.path===this.link.path)?this.refusedContact+1:0;
  if(this.refusedContact>1){
   if(!sim.walker.airborne&&sim.walker.wallHits().some(hit=>hit.poly.path===this.link.path&&CLIMBABLE.has(hit.poly.appflags??0))){
    const yaw=this.link.yaw*Math.PI/180;
    const from:Point=[s.x,s.y,s.z],back:Point=[s.x+Math.sin(yaw)*CLIMB_INPUT_ADAPTATION.runup,s.y,s.z+Math.cos(yaw)*CLIMB_INPUT_ADAPTATION.runup];
    if(this.canExit(from,back)){this.runup=back;return {command:command(-1,0,0,turn),done:false,failed:false};}
   }
   return {command:command(),done:true,failed:true};
  }
  return {command:command(aligned?1:0,0,0,turn),done:false,failed:false};
 }
}
