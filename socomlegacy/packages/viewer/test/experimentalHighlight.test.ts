import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {postShader} from './experimentalPostFixture';
import original from './experimentalPostOriginal.json';

describe('experimental highlight roll-off shader bypass',()=>{
  for(const kind of ['GLSL','WGSL'] as const) for(const bloom of [false,true]) {
    it(kind + (bloom ? ' with bloom' : ' without bloom') + ' keeps the pinned off shader and adds the shoulder only on request',()=>{
      const base = original.hashes[(kind+'/'+bloom) as keyof typeof original.hashes];
      const hash = (source:string) => createHash('sha256').update(source).digest('hex');
      expect(hash(postShader(kind,bloom,false))).toBe(base);
      const active = postShader(kind,bloom,true);
      expect(hash(active)).not.toBe(base);
      expect(active).not.toMatch(/NaN|Infinity/);
      expect(hash(postShader(kind,bloom,false))).toBe(base);
    });
  }
});
