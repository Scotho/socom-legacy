import { HostageFollow, FollowTrail, type FollowPlanner } from '../../match/src/hostageFollow';
import { describe, expect, it, vi } from 'vitest';
import { buildGrid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker } from '../src/mover';
import { Traversal } from '../src/traversal';
function contact(appflags: number, height = 20) {
  const poly = (path: string, points: number[], app = 0): WorldPoly => ({ modelName:'worldmodel', path, region:0, ditype:3, material:25, ptcount:4, cameratype:0, appflags:app, points:Float32Array.from(points) });
  const polys = [poly('floor',[-100,0,-100,100,0,-100,100,0,100,-100,0,100]), poly('wall',[-10,0,0,10,0,0,10,height,0,-10,height,0],appflags)];
  const params: GridParams = { atomCount:8192, posts:16, cellDim:100, cellsX:4, cellsZ:4, originX:-200, originZ:-200 };
  const grid = buildGrid(params,[],[],polys,polys.map((p,i)=>({modelName:p.modelName,path:p.path,first:i,count:1})));
  const w = new Walker(grid); w.place(0,0,5); w.glideAi(0,-1);
  return { w, grid, moves:new Traversal(grid,polys) };
}
describe('original AI contact climb (research334)',()=>{
  it('starts the eligible class4 climb without a player action press',()=>{
    const {w,moves}=contact(4);
    expect(moves.tickAi(w,{forward:1,right:0,boost:false},1/30)).toBe(true);
    expect(moves.state().kind).toBe('climb');
  });
  it('does not climb an ordinary wall or a contact faced away from',()=>{
    const plain=contact(0), away=contact(4); away.w.state.yaw=180;
    expect(plain.moves.tickAi(plain.w,{forward:1,right:0,boost:false},1/30)).toBe(false);
    expect(away.moves.tickAi(away.w,{forward:1,right:0,boost:false},1/30)).toBe(false);
  });
});

it('HOLD clears navigation without freezing the active body climb',()=>{
  const {w,grid,moves}=contact(4);
  const planner: FollowPlanner = { locate:()=>null, point:()=>[0,0,0], canTravel:()=>false, traversable:()=>false, plan:()=>null };
  const follower = new HostageFollow(planner,grid,[0,0,5],0);
  // Unit fixture: install the real mover/traversal pair already touching the synthetic wall.
  Object.assign(follower,{walker:w,traversal:moves});
  moves.tickAi(w,{forward:1,right:0,boost:false},1/30);
  const before = follower.traversalPose!.frame;
  follower.stop(); follower.physics(1/30);
  expect(follower.sub).toBe(0); expect(follower.goal).toBeNull();
  expect(follower.traversalPose!.frame).toBeGreaterThan(before);
});

it('the active climb reads this frame controller commands before advancing its body',()=>{
  const {w,grid,moves}=contact(4);
  const planner: FollowPlanner = { locate:()=>null, point:()=>[0,0,0], canTravel:()=>false, traversable:()=>false, plan:()=>null };
  const follower = new HostageFollow(planner,grid,[0,0,5],0);
  Object.assign(follower,{walker:w,traversal:moves}); moves.tickAi(w,{forward:0,right:0,boost:false},1/30);
  const internals = follower as unknown as { control:()=>void; steering:{forward:number} };
  const control = vi.spyOn(internals,'control').mockImplementation(()=>{ internals.steering.forward=.75; });
  follower.step(1/30,{id:1,feet:[0,0,-50],yaw:0,velocity:[0,0,0],topSpeed:65,stance:0},new FollowTrail(),0);
  expect(w.cutStick.forward).toBe(.75); control.mockRestore();
});

it('a released climb tick resumes ordinary motion once without retrying stale contact',()=>{
  const {w,grid,moves}=contact(4);
  const loc={map:0,x:0,z:0};
  const planner: FollowPlanner = { locate:()=>loc, point:()=>[0,0,0], canTravel:()=>true, traversable:()=>true, plan:()=>null };
  const f = new HostageFollow(planner,grid,[0,0,5],0);
  Object.assign(f,{walker:w,traversal:moves}); moves.tickAi(w,{forward:0,right:0,boost:false},1/30);
  const internals=f as unknown as { control:()=>void; steering:{forward:number}; bodyCommand:unknown };
  vi.spyOn(internals,'control').mockImplementation(()=>{internals.steering.forward=.75;internals.bodyCommand={forward:.75,side:0};});
  const tick=vi.spyOn(moves,'tickAi').mockImplementation(()=>{moves.flinchPop(w);return false;});
  const glide=vi.spyOn(w,'glideAi');
  f.step(1/30,{id:1,feet:[0,0,-50],yaw:0,velocity:[0,0,0],topSpeed:65,stance:0},new FollowTrail(),0);
  expect(glide).toHaveBeenCalledOnce(); expect(tick).toHaveBeenCalledOnce();
});
it('passes allowed turn into the climb cut and zeros it for a NoTurn clip',()=>{
  for(const clip of ['seal_step_up','seal_climbcrate']) {
    const {w,grid,moves}=contact(4);
    const planner: FollowPlanner={locate:()=>null,point:()=>[0,0,0],canTravel:()=>false,traversable:()=>false,plan:()=>null};
    const f=new HostageFollow(planner,grid,[0,0,5],0); Object.assign(f,{walker:w,traversal:moves});
    moves.tickAi(w,{forward:0,right:0,boost:false},1/30);
    vi.spyOn(moves,'pose').mockReturnValue({clip,frame:1,rootY:12,loop:false});
    const internals=f as unknown as {control:()=>void;steering:{turn:number}};
    vi.spyOn(internals,'control').mockImplementation(()=>{internals.steering.turn=.5;});
    let turn=NaN;vi.spyOn(moves,'tickAi').mockImplementation(()=>{turn=w.turn;return true;});
    f.step(1/30,{id:1,feet:[0,0,-50],yaw:0,velocity:[0,0,0],topSpeed:65,stance:0},new FollowTrail(),0);
    expect(turn).toBe(clip==='seal_step_up'?1:0);
  }
});

it('a released airborne traversal advances gravity in the same frame',()=>{
  const {w,grid,moves}=contact(4);
  const planner: FollowPlanner={locate:()=>null,point:()=>[0,0,0],canTravel:()=>false,traversable:()=>false,plan:()=>null};
  const f=new HostageFollow(planner,grid,[0,0,5],0);Object.assign(f,{walker:w,traversal:moves});
  moves.tickAi(w,{forward:0,right:0,boost:false},1/30);
  vi.spyOn(moves,'tickAi').mockImplementation(()=>{w.setAirborne(true,0);return false;});
  const gravity=vi.spyOn(w,'tick'); f.physics(1/30);
  expect(gravity).toHaveBeenCalledOnce();
});

it('negative hang command drops through the actual clip and gravity while its fall pose remains active',()=>{
  const {w,grid,moves}=contact(4,30);
  const planner: FollowPlanner={locate:()=>null,point:()=>[0,0,0],canTravel:()=>false,traversable:()=>false,plan:()=>null};
  const f=new HostageFollow(planner,grid,[0,0,5],0);Object.assign(f,{walker:w,traversal:moves});
  moves.tickAi(w,{forward:0,right:0,boost:false},1/30);
  for(let i=0;i<100 && moves.state().kind!=='hang';i++) moves.tickAi(w,{forward:0,right:0,boost:false},1/30);
  expect(moves.state().kind).toBe('hang');
  (f as unknown as {steering:{forward:number}}).steering.forward=-.25;
  let fallingPoseMoved=false;
  for(let i=0;i<100;i++) {
    const y=w.state.y, wasAir=w.airborne;
    f.physics(1/30);
    if(wasAir && moves.active && w.state.y<y) fallingPoseMoved=true;
  }
  expect(fallingPoseMoved).toBe(true);
});
