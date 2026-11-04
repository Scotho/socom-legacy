import {describe, expect, it} from 'vitest';
import {experimentalFrameSize} from '../src/experimentalResolution';
describe('bounded experimental render scale', () => {
  it('allows above 4x when the viewport fits the allocation limit', () => {
    expect(experimentalFrameSize(640,360,6)).toEqual({width:3840,height:2160,scale:6,limited:false});
  });
  it('bounds a large landscape or portrait viewport without stretching', () => {
    expect(experimentalFrameSize(1920,1080,6)).toMatchObject({width:4096,height:2304,limited:true});
    expect(experimentalFrameSize(1080,1920,6)).toMatchObject({width:2304,height:4096,limited:true});
  });
});
