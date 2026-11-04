import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';
import {FsAssetSource} from '@s2u/archive/node';
import {loadSimMap,loadSimClips} from '../../viewer/src/simMap';
import {loadKitSource} from '../../viewer/src/loadout';
import {Walker,groundPolygons} from '../../viewer/src/mover';
import {Traversal} from '../../viewer/src/traversal';
import {MoverSim} from '../../viewer/src/net/moverSim';
import {WalkingNavigation} from '../src/bots/navigation';
import {BotClimbDrive} from '../src/bots/climbDrive';

const disc=process.env.SOCOM_DISC;
const have=!!disc&&['RUN/MP6.ZDB','RUN/MOTION_P.ZAR','RUN/READERC.ZAR'].every(p=>existsSync(resolve(disc,p)));
/** MP6 positions read by the existing mp6DeckClimb parity pin, not production map hints or original-runtime proof. */
describe.skipIf(!have)('bot climb on actual Desert Glory sandbags (dev disc)',()=>{
 it('discovers and completes the native hang and pull-up with actual motion clips',async()=>{
  const source=new FsAssetSource(disc!),kit=await loadKitSource(source),clips=await loadSimClips(source);
  expect(clips).not.toBeNull();const map=await loadSimMap(source,'RUN/MP6.ZDB',kit);
  const nav=new WalkingNavigation(map,{version:2,map:'MP6',nodes:[
   {at:[1803,30,1388],edges:[],component:0},{at:[1803,60,1370],edges:[],component:1}]});
  nav.configureClimbing(clips);
  // P537-L3 climbs: his cooperative route query (routes', P537-L3 (6)) as main's route, asked again while the discovery steps.
  let route:number[][]=[];
  for(let tick=0;tick<2400&&!route.length;tick++){route=nav.route([1803,30,1388],[1803,60,1370]);if(!route.length)nav.stepClimbDiscovery(8);}
  expect(route.length).toBeGreaterThan(0);
  const link=nav.climbLinks.find(l=>l.path==='worldmodel/sausage_climber_dis');expect(link).toBeDefined();
  const walker=new Walker(map.grid),moves=new Traversal(map.grid,groundPolygons(map.ground));
  moves.setClips(clips!.clips,clips!.table);walker.actionRoots=clips!.roots;expect(walker.place(...link!.entry)).toBe(true);walker.state.yaw=link!.yaw;
  const sim=new MoverSim(walker,moves),drive=new BotClimbDrive(link!,0,(a,b)=>nav.canWalk(a,b));
  const states=new Set<string>();let result:ReturnType<BotClimbDrive['step']>|undefined;
  for(let tick=0;tick<1200;tick++){result=drive.step(sim,tick);if(result.command)sim.apply(result.command);states.add(moves.state().kind);if(result.done)break;}
  expect(result).toMatchObject({done:true,failed:false});expect(states.has('hang')||states.has('hangUp')).toBe(true);
  expect(walker.state.y).toBeCloseTo(60,1);expect(moves.busy()).toBe(false);
 },120_000);
});
