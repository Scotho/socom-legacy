/**
 * The test room's live readout (`./devPanel`). A browser adaptation: where the page is, how it is moving, and
 * which map and mode it is in. It reads the walk and the camera; it does not decide either. A development
 * instrument with no original; it reads and sets nothing, and while the panel is closed, the game's clock and ammo are main's; only the drawing overlays may stay.
 */
export interface DevLive {
  /** The map's name, or null before one is shown. */
  map: string | null;
  /** The archive stem the share link writes (`map=`), or null before one is shown. */
  archive: string | null;
  /** The map's mission mode, or '' when the page has none. */
  mission: string;
  play: boolean;
  camera: 'walk' | 'fly';
  x: number;
  y: number;
  z: number;
  /** Degrees, the camera's yaw. */
  yaw: number;
  /** Horizontal speed, units a second (0 in fly). */
  speed: number;
  stance: string;
}

export function formatDevReadout(live: DevLive): string {
  const mission = live.mission ? ` · ${live.mission}` : '';
  const pos = `${live.x.toFixed(1)}, ${live.y.toFixed(1)}, ${live.z.toFixed(1)}`;
  return `${live.map ?? 'no map'}${mission}\n${live.play ? 'play' : 'explore'} · ${live.camera}\n${pos} · yaw ${live.yaw.toFixed(1)}\n${live.speed.toFixed(1)} u/s · ${live.stance}`;
}
