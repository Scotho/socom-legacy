import { describe, expect, it } from 'vitest';
import { formatDevReadout, type DevLive } from '../src/devReadout';

const live: DevLive = {
  map: 'Frostfire', archive: 'MP01', mission: 'escort', play: true, camera: 'walk',
  x: 1.26, y: 2, z: -3.04, yaw: 90.04, speed: 4.16, stance: 'crouch',
};

describe('the developer readout', () => {
  it('names the map, the mode, the spot, the speed and the stance', () => {
    expect(formatDevReadout(live)).toBe('Frostfire · escort\nplay · walk\n1.3, 2.0, -3.0 · yaw 90.0\n4.2 u/s · crouch');
  });

  it('says when there is no map, and leaves a mission out when there is none', () => {
    expect(formatDevReadout({ ...live, map: null, mission: '', play: false, camera: 'fly', stance: 'fly' })).toBe(
      'no map\nexplore · fly\n1.3, 2.0, -3.0 · yaw 90.0\n4.2 u/s · fly',
    );
  });
});
