import {polygonNormal,type WorldPoly} from '@s2u/scene';
import {BODY_RADIUS,Walker,groundPolygons} from '../../../viewer/src/mover';
import {Traversal} from '../../../viewer/src/traversal';
import {MoverSim} from '../../../viewer/src/net/moverSim';
import {CLIMBABLE} from '../../../viewer/src/climb';
import type {SimClips,SimMap} from '../../../viewer/src/simMap';
import {TICK_HZ} from '../../../viewer/src/net/protocol';
import {BotClimbDrive,type BotClimbLink} from './climbDrive';
import type {Point} from './navigationShape';

/** Authored search schedule (OT.R81), not retail climb dimensions. Every edge completes the native move. */
const CLIMB_SEARCH_ADAPTATION={bucket:50,approach:BODY_RADIUS+1,column:5,probeTicks:20*TICK_HZ};
type Face={poly:WorldPoly;nx:number;nz:number;ax:number;az:number;bx:number;bz:number;top:number};
export class BotClimbDiscovery {
 private readonly faces:Face[]=[];
 private readonly buckets=new Map<string,number[]>();
 private readonly visited=new Set<number>();
 private readonly columns=new Set<string>();
 private readonly queue:{node:number;face:Face;entry:Point;exit:Point}[]=[];
 private cursor=0;
 private active:{node:number;sim:MoverSim;drive:BotClimbDrive;link:BotClimbLink;tick:number;engaged:boolean}|null=null;
 constructor(private readonly map:SimMap,private readonly clips:SimClips,
  private readonly walk:(a:Point,b:Point)=>boolean,private readonly admit:(node:number,link:BotClimbLink)=>void){
  for(const poly of groundPolygons(map.ground)){
   if(!CLIMBABLE.has(poly.appflags??0))continue;
   const n=polygonNormal(poly.points);if(!n)continue;
   const scale=Math.hypot(n[0],n[2]);if(!scale)continue;
   let a=0,b=0,longest=0,top=-Infinity;
   for(let i=0;i<poly.points.length;i+=3){top=Math.max(top,poly.points[i+1]!);
    for(let j=i+3;j<poly.points.length;j+=3){const d=Math.hypot(poly.points[j]!-poly.points[i]!,poly.points[j+2]!-poly.points[i+2]!);
     if(d>longest){longest=d;a=i;b=j;}}}
   if(longest<1)continue;
   const face:Face={poly,nx:n[0]/scale,nz:n[2]/scale,ax:poly.points[a]!,az:poly.points[a+2]!,bx:poly.points[b]!,bz:poly.points[b+2]!,top};
   const id=this.faces.push(face)-1,margin=CLIMB_SEARCH_ADAPTATION.bucket;
   for(let x=Math.floor((Math.min(face.ax,face.bx)-margin)/margin);x<=Math.floor((Math.max(face.ax,face.bx)+margin)/margin);x++)
    for(let z=Math.floor((Math.min(face.az,face.bz)-margin)/margin);z<=Math.floor((Math.max(face.az,face.bz)+margin)/margin);z++){
     const key=`${x},${z}`,list=this.buckets.get(key)??[];list.push(id);this.buckets.set(key,list);
    }
  }
 }
 get enabled():boolean{return this.faces.length>0;}
 get pending():boolean{return this.active!==null||this.cursor<this.queue.length;}
 enqueue(node:number,at:Point):void {
  if(this.visited.has(node))return;this.visited.add(node);
  const size=CLIMB_SEARCH_ADAPTATION.bucket;
  for(const id of this.buckets.get(`${Math.floor(at[0]/size)},${Math.floor(at[2]/size)}`)??[]){
   const face=this.faces[id]!,dx=face.bx-face.ax,dz=face.bz-face.az,length=dx*dx+dz*dz;
   const t=Math.max(0,Math.min(1,((at[0]-face.ax)*dx+(at[2]-face.az)*dz)/length));
   const x=face.ax+dx*t,z=face.az+dz*t;
   if(Math.hypot(x-at[0],z-at[2])>size||at[1]>=face.top)continue;
   const key=`${id}:${Math.round(x/CLIMB_SEARCH_ADAPTATION.column)}:${Math.round(z/CLIMB_SEARCH_ADAPTATION.column)}:${Math.round(at[1])}`;
   if(this.columns.has(key))continue;this.columns.add(key);
   const entry:Point=[x+face.nx*CLIMB_SEARCH_ADAPTATION.approach,at[1],z+face.nz*CLIMB_SEARCH_ADAPTATION.approach];
   const ex=x-face.nx*(BODY_RADIUS+5),ez=z-face.nz*(BODY_RADIUS+5);
   this.queue.push({node,face,entry,exit:[ex,face.top,ez]});
  }
 }
 step(budget:number,nodes:readonly {at:Point}[]):void {
  // At most one scratch initialization per update; native command work has its own shared budget.
  if(!this.active&&this.cursor<this.queue.length){
   const job=this.queue[this.cursor++]!;
   if(!this.walk(nodes[job.node]!.at,job.entry))return;
   const walker=new Walker(this.map.grid),moves=new Traversal(this.map.grid,groundPolygons(this.map.ground));
   moves.setClips(this.clips.clips,this.clips.table);walker.actionRoots=this.clips.roots;
   if(!walker.place(...job.entry))return;
   const yaw=Math.atan2(job.face.nx,job.face.nz)*180/Math.PI;walker.state.yaw=yaw;
   const link:BotClimbLink={entry:[walker.state.x,walker.state.y,walker.state.z],exit:job.exit,yaw,path:job.face.poly.path,kind:'low'};
   this.active={node:job.node,sim:new MoverSim(walker,moves),drive:new BotClimbDrive(link,0,this.walk),link,tick:0,engaged:false};
  }
  const active=this.active;if(!active)return;
  for(let i=0;i<Math.max(0,Math.floor(budget));i++){
   // Unlike a live player, this disposable mover may be abandoned while its native move is busy.
   if(active.tick>=CLIMB_SEARCH_ADAPTATION.probeTicks){this.active=null;break;}
   const moves=active.sim.moves instanceof Traversal?active.sim.moves:null;
   active.engaged ||= !!moves&&['climb','climbAlign','hang','hangUp','hangDown','hangDropFall'].includes(moves.state().kind);
   if(active.engaged&&!moves?.busy()&&!active.sim.walker.airborne){
    const s=active.sim.walker.state;active.link.exit=[s.x,s.y,s.z];
   }
   const prompt=active.sim.moves instanceof Traversal?active.sim.moves.climbPrompt():null;if(prompt)active.link.kind=prompt.kind;
   const result=active.drive.step(active.sim,active.tick++);
   if(result.command)active.sim.apply(result.command);
   if(result.done){if(!result.failed)this.admit(active.node,active.link);this.active=null;break;}
  }
 }
}
