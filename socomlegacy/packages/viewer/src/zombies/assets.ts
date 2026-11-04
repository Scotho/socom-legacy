/**
 * The zombies model and sounds, taken only from a pack the visitor loaded (`TEST_ROOM_ZOMBIES_ADAPTATION`).
 * Nothing here is fetched. A missing cue is silent.
 */
import {
  AnimationMixer, Box3, ExtrudeGeometry, Float32BufferAttribute, Group, LoadingManager, LoopOnce, LoopRepeat, Mesh,
  MeshBasicMaterial, Shape, SkinnedMesh, Sphere, Vector3, type AnimationAction, type Material, type Skeleton,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { gameAudio } from '../audio';
import { ZOMBIE_CLIPS, ZOMBIE_OUTSIDE_MODEL } from './pack';
import { ZOMBIE_TYPES, type ZombieKind } from './evolution';
import type { ZombiePack } from './pack';

export interface ZombieView {
  root: Group;
  head?: () => [number, number, number];
  react?: (headshot: boolean) => void;
  animate: (name: string, dt: number, rate?: number) => void;
  dispose: () => void;
}

export interface ZombieAssets {
  clips: { name: string; duration: number }[];
  sound: (group: string, distance?: number) => void;
  cue: (name: string) => void;
  stop: () => void;
  create: (kind?: ZombieKind) => ZombieView;
}

const asBasic = (material: Material): MeshBasicMaterial => {
  const source = material as MeshBasicMaterial;
  return new MeshBasicMaterial({ map: source.map ?? null, color: 0xb8b8b8, side: source.side });
};

/**
 * The loader's own line behind the pack reader's (the review's ask 3): it may resolve only the model's `data:` bytes and
 * the `blob:` URLs three makes of its embedded images; any other address is refused before a request starts.
 */
function packOnly(): LoadingManager {
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    throw new Error(ZOMBIE_OUTSIDE_MODEL);
  });
  return manager;
}

export async function loadZombieAssets(pack: ZombiePack): Promise<ZombieAssets> {
  const gltf = await new GLTFLoader(packOnly()).parseAsync(pack.glb, '');
  const bounds = new Box3().setFromObject(gltf.scene), size = bounds.getSize(new Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Invalid zombie model');
  for (const name of ZOMBIE_CLIPS) if (!gltf.animations.some((c) => c.name === name)) throw new Error('Missing zombie animation: ' + name);
  gltf.scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.material = Array.isArray(o.material) ? o.material.map(asBasic) : asBasic(o.material);
  });
  const skinMeshes: SkinnedMesh[] = [];
  gltf.scene.traverse((o) => { if (o instanceof SkinnedMesh) skinMeshes.push(o); });
  const spheres = skinMeshes.map(() => new Sphere().makeEmpty());
  const boundsMixer = new AnimationMixer(gltf.scene);
  for (const clip of gltf.animations) {
    const action = boundsMixer.clipAction(clip);
    action.play();
    for (let sample = 0; sample <= 24; sample++) {
      boundsMixer.setTime(clip.duration * sample / 24);
      gltf.scene.updateMatrixWorld(true);
      skinMeshes.forEach((mesh, i) => { mesh.skeleton.update(); mesh.computeBoundingSphere(); spheres[i]!.union(mesh.boundingSphere!); });
    }
    action.stop();
  }
  boundsMixer.stopAllAction();
  boundsMixer.uncacheRoot(gltf.scene);
  skinMeshes.forEach((mesh, i) => {
    const sphere = spheres[i]!;
    sphere.radius *= 1.5;
    mesh.boundingSphere = sphere;
    mesh.frustumCulled = true;
  });

  const plate = new Shape();
  plate.moveTo(-1.7, 2.5); plate.lineTo(1.7, 2.5); plate.lineTo(2.5, 1.5); plate.lineTo(2.3, -2);
  plate.lineTo(1.5, -2.6); plate.lineTo(-1.5, -2.6); plate.lineTo(-2.3, -2); plate.lineTo(-2.5, 1.5); plate.closePath();
  const armorGeometry = new ExtrudeGeometry(plate, { depth: .5, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .22, bevelThickness: .2 });
  armorGeometry.translate(0, 0, -.25);
  const normals = armorGeometry.getAttribute('normal');
  const colors: number[] = [];
  for (let i = 0; i < normals.count; i++) {
    const shade = .62 + .25 * Math.abs(normals.getZ(i)) + .12 * Math.max(0, normals.getY(i));
    colors.push(shade, shade, shade);
  }
  armorGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const armorMaterial = new MeshBasicMaterial({ color: 0x7e8995, vertexColors: true });
  const variantMaterials = new Map<string, MeshBasicMaterial>();

  const canHear = typeof AudioContext !== 'undefined';
  const context = canHear ? new AudioContext() : null;
  const decoded = new Map<string, AudioBuffer>();
  const pending = new Map<string, Promise<AudioBuffer | null>>();
  const voices = new Set<AudioBufferSourceNode>();

  const bufferFor = (path: string): Promise<AudioBuffer | null> => {
    if (!context) return Promise.resolve(null);
    const have = decoded.get(path);
    if (have) return Promise.resolve(have);
    const waiting = pending.get(path);
    if (waiting) return waiting;
    const bytes = pack.sound(path);
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    const job = context.decodeAudioData(copy).then((audio) => { decoded.set(path, audio); return audio; }).catch(() => null);
    pending.set(path, job);
    return job;
  };
  const play = (path: string | undefined, distance: number): void => {
    if (!path || !context || voices.size >= 6) return;
    void bufferFor(path).then((audio) => {
      if (!audio || !context || voices.size >= 6) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = gameAudio.muted() ? 0 : Math.min(.6, 35 / Math.max(35, distance)) * gameAudio.volume();
      source.buffer = audio;
      source.connect(gain);
      gain.connect(context.destination);
      voices.add(source);
      source.onended = () => { voices.delete(source); };
      try { source.start(); } catch { voices.delete(source); }
    });
  };

  return {
    clips: gltf.animations.map((c) => ({ name: c.name, duration: c.duration })),
    sound(group: string, distance = 0) {
      const paths = pack.groups[group];
      if (!paths?.length) return;
      play(paths[Math.floor(Math.random() * paths.length)], distance);
    },
    cue(name: string) { play(pack.cues[name], 0); },
    stop() {
      for (const voice of voices) { try { voice.stop(); } catch { /* already ended */ } }
      voices.clear();
      void context?.close();
    },
    create(kind: ZombieKind = 'shambler') {
      const root = new Group(), model = clone(gltf.scene);
      root.add(model);
      const scale = 20 / size.y;
      model.scale.setScalar(scale);
      model.position.y = -bounds.min.y * scale;
      model.rotation.y = Math.PI;
      model.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const tint = (m: Material): MeshBasicMaterial => {
          const basic = m as MeshBasicMaterial;
          const key = kind + basic.uuid;
          let material = variantMaterials.get(key);
          if (!material) { material = basic.clone(); material.color.setHex(ZOMBIE_TYPES[kind].color); variantMaterials.set(key, material); }
          return material;
        };
        o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
      });
      let armor: Mesh | null = null;
      if (kind === 'armored' || kind === 'brute') { armor = new Mesh(armorGeometry, armorMaterial); root.add(armor); }
      model.traverse((o) => {
        if (o instanceof SkinnedMesh) o.frustumCulled = true;
        if (o.type === 'Bone' && o.parent?.type !== 'Bone') {
          let onlyBones = true;
          o.traverse((child) => { if (child.type !== 'Bone') onlyBones = false; });
          if (onlyBones) o.visible = false;
        }
      });
      const palettes: Skeleton[] = [];
      model.traverse((o) => {
        if (!(o instanceof SkinnedMesh)) return;
        const same = palettes.find((p) => p.bones.length === o.skeleton.bones.length && p.bones.every((b, i) => b === o.skeleton.bones[i] && p.boneInverses[i]!.equals(o.skeleton.boneInverses[i]!)));
        if (same) o.skeleton = same;
        else palettes.push(o.skeleton);
      });
      const mixer = new AnimationMixer(model), actions = new Map<string, AnimationAction>();
      for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
      let current = '', reaction = 0, headReaction = false, layered = false;
      const head = pack.bones.head ? model.getObjectByName(pack.bones.head) ?? null : null;
      const spine = pack.bones.spine ? model.getObjectByName(pack.bones.spine) ?? null : null;
      const headBase = head?.quaternion.clone() ?? null, spineBase = spine?.quaternion.clone() ?? null;
      const headPosition = new Vector3(), armorPosition = new Vector3();
      return {
        root,
        head() {
          if (head) head.getWorldPosition(headPosition);
          else headPosition.copy(root.position).add(new Vector3(0, 18, 0));
          return headPosition.toArray() as [number, number, number];
        },
        react(headshot: boolean) { reaction = .28; headReaction = headshot; },
        animate(name: string, dt: number, rate = 1) {
          if (current !== name) {
            const previous = actions.get(current), next = actions.get(name);
            if (next) {
              next.reset();
              next.setLoop(name === 'attack' || name === 'death' ? LoopOnce : LoopRepeat, Infinity);
              next.clampWhenFinished = true;
              next.play();
              if (previous) next.crossFadeFrom(previous, .12, false);
              current = name;
            }
          }
          actions.get(name)?.setEffectiveTimeScale(rate);
          if (layered) {
            if (head && headBase) head.quaternion.copy(headBase);
            if (spine && spineBase) spine.quaternion.copy(spineBase);
          }
          mixer.update(dt);
          if (head && headBase) headBase.copy(head.quaternion);
          if (spine && spineBase) spineBase.copy(spine.quaternion);
          reaction = Math.max(0, reaction - dt);
          layered = reaction > 0 && name !== 'death';
          if (layered) {
            const kick = Math.sin((1 - reaction / .28) * Math.PI);
            if (spine) spine.rotateX(-.2 * kick);
            if (head) head.rotateX(-(headReaction ? .45 : .15) * kick);
          }
          if (armor && head) {
            root.updateMatrixWorld(true);
            armor.position.copy(root.worldToLocal(head.getWorldPosition(armorPosition)));
            armor.position.set(armor.position.x * .5, armor.position.y - 5.5, armor.position.z * .5 - 1.5);
          }
        },
        dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); root.removeFromParent(); },
      };
    },
  };
}
