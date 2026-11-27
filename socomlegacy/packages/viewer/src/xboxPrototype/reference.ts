import { Scene, Color, type Group, Matrix4 } from 'three';
import { buildWorld } from '../world';
import { buildBody } from '../bodyView';
import { createRenderer } from '../renderer';
import { applyFog } from '../fog';
import type { LoadedMap } from '../loadMap';
import type { LoadedBody } from '../body';
import { actorsOf, bodyModel, gearVisible, type SceneFrame } from './sceneFrame';
import { Reticle } from '../reticle';
import { DEFAULT_RENDER_VIEW } from '../zoom';
import { worldChanges } from './worldFrame';
import { SCOPE_BITMAPS } from '../sights';

/** Existing renderer comparison. Imported only after the reference path is selected. */
export async function referencePrototype(canvas: HTMLCanvasElement, map: LoadedMap, body: LoadedBody | readonly LoadedBody[], withHud = false) {
  const models: readonly LoadedBody[] = Array.isArray(body) ? body : [body as LoadedBody];
  const renderer = await createRenderer(canvas, { graphics: 'xbox', antialias: false });
  let world: ReturnType<typeof buildWorld> | undefined;
  let hud: import('../hud').Hud | undefined;
  let reticle: Reticle | undefined;
  const actors = new Map<number, { model: number; view: ReturnType<typeof buildBody> }>();
  const heldViews = new Map<string, Group>();
  const objectViews = new Map<number, { model: string; group: Group }>();
  const actorMatrix = new Matrix4(), heldMatrix = new Matrix4();
  let disposed = false;
  const changes = worldChanges();
  try {
    hud = withHud ? new (await import('../hud')).Hud() : undefined;
    hud?.setBitmaps(map.hud);
    if (withHud) { reticle = new Reticle(); reticle.setBitmaps(map.reticle); }
    renderer.setPixelRatio(1); renderer.setPresentation('native'); renderer.resize(640, 448);
    renderer.renderer.info.autoReset = false;
    const scene = new Scene();
    const lighting = { rig: map.lightRig ?? null, brighten: 0, rigEverywhere: false };
    world = buildWorld(map); world.setLighting(lighting); world.setDetail(false); world.setBillboards(true);
    world.setLineStrips(false); world.setEngineOrder(false);
    for (const reveal of [...world.revealWorld, ...world.revealProps]) reveal();
    scene.add(world.group);
    if (map.camera) {
      const f = map.camera;
      scene.background = new Color(...f.fogColor.map(v => v / 255) as [number, number, number]);
      applyFog(scene, { enabled: f.fogEnabled, near: f.fogNear, far: f.fogFar, color: f.fogColor,
        altitude: f.fogAltitude ? { top: f.fogTop, bottom: f.fogBottom } : null });
    }
    const stats = { backend: renderer.backend, gpuPayloadBytes: null, drawCalls: 0, triangles: 0, actors: 0 };
    return {
      stats, hud,
      render(frame: SceneFrame) {
        const { camera } = frame;
        if (disposed) throw new Error('Prototype renderer disposed');
        for (const op of changes.take(frame.world)) {
          if (op.kind === 'move') world!.moveNode(op.path, op.value);
          else if (op.kind === 'visible') world!.setNodeActive(op.path, op.value);
          else if (op.kind === 'opacity') world!.setNodeOpacity(op.path, op.value);
          else world!.setNodeUvOffset(op.path, op.value[0], op.value[1]);
        }
        const current = actorsOf(frame, models.length), kept = new Set<number>(), heldKept = new Set<string>();
        for (const actor of current) {
          kept.add(actor.id);
          let own = actors.get(actor.id);
          if (!own || own.model !== actor.modelIndex) {
            const view = buildBody(models[actor.modelIndex]!, map, lighting); view.setVisible(true); scene.add(view.group);
            if (own) { scene.remove(own.view.group); own.view.dispose(); }
            own = { model: actor.modelIndex, view }; actors.set(actor.id, own);
          }
          own.view.place(actor.position, actor.yawRadians * 180 / Math.PI); own.view.setPose(actor.local);
          for (const fitting of models[actor.modelIndex]!.fittings) own.view.setGearVisible(fitting.name, gearVisible(fitting.name, actor.gear));
          for (const held of actor.held ?? []) {
            const key = `${actor.id}:${held.name}`; heldKept.add(key);
            let group = heldViews.get(key);
            if (!group) { const template = world!.held(held.name); if (!template) continue;
              group = template.clone(true); group.matrixAutoUpdate = false; scene.add(group); heldViews.set(key, group); }
            group.matrix.copy(bodyModel(actor, actorMatrix)).multiply(heldMatrix.fromArray(held.matrix)); group.matrixWorldNeedsUpdate = true;
          }
        }
        for (const [id, own] of actors) if (!kept.has(id)) { scene.remove(own.view.group); own.view.dispose(); actors.delete(id); }
        for (const [key, group] of heldViews) if (!heldKept.has(key)) { scene.remove(group); heldViews.delete(key); }
        const objectsKept = new Set<number>();
        for (const object of frame.objects ?? []) {
          objectsKept.add(object.id);
          let view = objectViews.get(object.id);
          if (!view || view.model !== object.model) {
            if (view) scene.remove(view.group);
            objectViews.delete(object.id);
            const template = world!.grenades[object.model]; if (!template) continue;
            const group = template.clone(true); group.matrixAutoUpdate = false; scene.add(group);
            view = { model: object.model, group }; objectViews.set(object.id, view);
          }
          view.group.matrix.fromArray(object.matrix); view.group.matrixWorldNeedsUpdate = true;
        }
        for (const [id, view] of objectViews) if (!objectsKept.has(id)) { scene.remove(view.group); objectViews.delete(id); }
        stats.actors = actors.size; world!.frame(camera, frame.deltaSeconds ?? 0, { ...DEFAULT_RENDER_VIEW,
          magnification: frame.magnification ?? DEFAULT_RENDER_VIEW.magnification, farExtra: frame.farExtra ?? 0 });
        renderer.renderer.info.reset(); renderer.render(scene, camera);
        if (reticle) {
          const sight = frame.reticle;
          reticle.setVisible(!!sight?.visible);
          if (sight) {
            reticle.setSet(sight.set); reticle.setAimPoint(...sight.aim); reticle.setSize(sight.size, sight.offset);
            reticle.setMode(sight.mode ?? 'reticle'); reticle.setNight(sight.night ?? false);
            reticle.setScopeBitmaps(sight.scopeBitmaps ?? SCOPE_BITMAPS);
          }
          reticle.render(renderer.renderer);
        }
        hud?.render(renderer.renderer);
        stats.drawCalls = renderer.renderer.info.render.drawCalls; stats.triangles = renderer.renderer.info.render.triangles;
      },
      async dispose() { if (disposed) return; disposed = true; for (const own of actors.values()) { scene.remove(own.view.group); own.view.dispose(); }
        actors.clear(); for (const group of heldViews.values()) scene.remove(group); heldViews.clear();
        for (const view of objectViews.values()) scene.remove(view.group); objectViews.clear();
        reticle?.setBitmaps(null); hud?.dispose(); world!.dispose(); await renderer.renderer.dispose(); },
    };
  } catch (error) { for (const own of actors.values()) own.view.dispose(); actors.clear(); reticle?.setBitmaps(null); hud?.dispose(); world?.dispose(); await renderer.renderer.dispose(); throw error; }
}
