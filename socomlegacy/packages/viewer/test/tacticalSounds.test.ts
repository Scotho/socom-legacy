import {expect,it} from 'vitest';
import {TacticalSoundGroup,readTacticalSoundGroups} from '../src/tacticalSounds';

it('preserves EE toward-zero weights at a variant-selection boundary',()=>{
  // Native 347d40/348710 arithmetic, independently reread (research 302).
  // After A, chopped A weight=.0476190447807312; nearest rounding would be
  // .0476190522313118 and incorrectly choose A again at this float32 sample.
  const group=new TacticalSoundGroup({name:'order',dynamic:Math.fround(.05),members:[{name:'A',weight:0},{name:'B',weight:0}]});
  expect(group.pick(.25)).toBe('A');
  expect(group.pick(.0476190485060215)).toBe('B');
});

it('uses native cumulative strict selection and dynamic renormalization instead of uniform alternation',()=>{
  const group=new TacticalSoundGroup({name:'order',dynamic:.05,members:[{name:'A',weight:0},{name:'B',weight:0}]});
  expect(group.pick(.25)).toBe('A');
  expect(group.pick(.25)).toBe('B');
  expect(group.pick(.25)).toBe('A');
  const boundary=new TacticalSoundGroup({name:'order',dynamic:0,members:[{name:'A',weight:0},{name:'B',weight:0}]});
  expect(boundary.pick(.5)).toBe('B');expect(boundary.pick(.5)).toBe('A');
  expect(boundary.pick(1)).toBeNull();
});
it('reads only loaded multiplayer group blocks and retains only resolved children',()=>{
  const root=['GROUPS',['MP_COMMON',[['order','DYNAMIC_WEIGHTS',['0.05'],'ENTRIES',[['A'],['MISSING'],['B','WEIGHT',['2']]]]],'UI',[['other','ENTRIES',[['C']]]]]];
  expect(readTacticalSoundGroups(root,['order','other'],n=>n!=='MISSING')).toEqual([
    {name:'order',dynamic:Math.fround(.05),members:[{name:'A',weight:0},{name:'B',weight:2}]},
  ]);
  expect(new TacticalSoundGroup({name:'empty',dynamic:0,members:[]}).pick(.1)).toBeNull();
});
