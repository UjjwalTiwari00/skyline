/**
 * The scroll-driven tower scene.
 *
 * Plain Three.js with no React involvement: this module is loaded by a dynamic
 * import after first paint, and nothing in the initial bundle may reference it.
 * Keeping it framework-free also means the render loop owns its own timing
 * rather than fighting React's.
 *
 * Scroll drives a single `progress` value in [0, 1]. Everything else — camera,
 * floor assembly, facade opacity, label positions — is a pure function of that
 * value, which is what makes scrubbing reversible: there is no accumulated
 * state to unwind when the user scrolls back up.
 *
 * The displayed progress is damped toward the target each frame rather than
 * snapped to it, so a fast flick eases into place instead of jumping.
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FogExp2,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';

export interface SceneHandle {
  /** Target scroll progress in [0, 1]. Cheap; safe to call every scroll event. */
  setProgress(progress: number): void;
  /** Pointer position in [-1, 1] for the parallax touch. */
  setPointer(x: number, y: number): void;
  setSize(width: number, height: number): void;
  /** Starts/stops the rAF loop — driven by visibility, not by scrolling. */
  setRunning(running: boolean): void;
  /** Screen-space positions for the DOM labels, recomputed each frame. */
  onLabels(callback: (labels: LabelPosition[]) => void): void;
  dispose(): void;
}

export interface LabelPosition {
  id: string;
  x: number;
  y: number;
  /** False when the point is behind the camera or off-screen. */
  visible: boolean;
}

export interface SceneOptions {
  /** Static render only: no rAF loop, no scrubbing. */
  reducedMotion: boolean;
}

const FLOOR_COUNT = 34;
const FLOOR_HEIGHT = 1.15;
const TOWER_W = 7;
const TOWER_D = 5.2;
const TOWER_HEIGHT = FLOOR_COUNT * FLOOR_HEIGHT;
/** Roof spire, measured from the roof slab. */
const CROWN_HEIGHT = FLOOR_HEIGHT * 4.2;

/** Anchors for the DOM labels in scene 3. */
const ROOM_LABELS = [
  { id: 'living', position: new Vector3(-1.9, 0, 1.3) },
  { id: 'bedroom', position: new Vector3(2.0, 0, 1.1) },
  { id: 'balcony', position: new Vector3(0.2, 0, -2.2) },
];

/** Anchors for the amenity stops in scene 4. */
/**
 * Anchors sit on the rebuilt podium, not on the ground plane. These have to
 * track the geometry: when the podium was stepped up, labels left at y = 0.6
 * floated below the deck they were naming.
 */
const AMENITY_ANCHORS = [
  { id: 'pool', position: new Vector3(-10, 2.1, 7) },
  { id: 'gym', position: new Vector3(9.5, 4.2, 3) },
  { id: 'garden', position: new Vector3(-2, 2.4, 14) },
];

/**
 * Camera path.
 *
 * Keyframes are (progress, position, lookAt) and are interpolated with a
 * smoothstep between neighbours, so the camera accelerates out of a stop and
 * decelerates into the next one instead of moving linearly between them.
 *
 *   0.00-0.20  arrival      slow orbit, tower in its surroundings
 *   0.20-0.42  build-up     pull back as floors stack
 *   0.42-0.62  inside       push through the facade into one floor
 *   0.62-0.88  amenities    three stops at ground level
 *   0.88-1.00  settle       final hero framing for the CTA
 */
interface Keyframe {
  at: number;
  position: [number, number, number];
  target: [number, number, number];
}

const KEYFRAMES: Keyframe[] = [
  // Arrival. The tower tops out around y = 43, so at a 42-degree field of
  // view the camera has to sit ~55 units out to hold the whole building in
  // frame. The first build of this scene framed it from 30 units and the
  // tower ran out of the top of the screen.
  { at: 0.0, position: [44, 20, 46], target: [0, 17, 0] },
  { at: 0.2, position: [-40, 17, 48], target: [0, 18, 0] },

  // Topped out, seen slightly from above.
  { at: 0.4, position: [-22, 36, 52], target: [0, 21, 0] },

  /**
   * Inside. The camera stays OUTSIDE and moves to a three-quarter view while
   * the near facade dissolves — a cutaway, which is how an architectural
   * render shows a floor plate. An earlier version put the camera at
   * [0.4, 20.4, 3.4], i.e. literally inside the floor, and the result was
   * unreadable: full-bleed horizontal planes with no spatial cue.
   */
  { at: 0.52, position: [27, 25, 27], target: [0, 21, 0] },
  { at: 0.62, position: [16, 21.6, 16], target: [0, 20.4, 0] },

  // Amenities. Elevated three-quarter stops that keep the tower base in
  // frame, so each stop reads as part of the building rather than as a
  // coloured plane. These were previously ~3 units above ground and a few
  // units from the target, which filled the screen with lawn.
  { at: 0.7, position: [-28, 14, 26], target: [-10, 2.2, 7] },
  { at: 0.78, position: [27, 13, 20], target: [9.5, 3.8, 3] },
  { at: 0.86, position: [2, 15, 38], target: [-2, 2.5, 14] },

  { at: 1.0, position: [40, 19, 42], target: [0, 16, 0] },
];

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Maps global progress onto a 0-1 ramp inside [from, to]. */
function phase(progress: number, from: number, to: number): number {
  return clamp01((progress - from) / (to - from));
}

/** Horizon haze. Fog is tinted to match it so distant blocks dissolve into the sky. */
const HORIZON = 0x7d5f78;

/**
 * A dusk sky, drawn to a 2:1 canvas and used as BOTH the scene background and
 * the environment map.
 *
 * This is the single change that most affects how the scene reads. Before it,
 * `scene.background` was a flat dark colour, so the tower and the podium
 * floated in a void with no horizon and nothing for the glass to reflect —
 * exactly the "default grey-on-black" the brief warns about.
 *
 * Still no HDR download: this is a couple of canvas gradients, so the 2 MB
 * texture budget stays at zero. 2:1 is required for equirectangular mapping,
 * which puts the horizon at v = 0.5 where it belongs.
 */
function makeSky(): CanvasTexture {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext('2d');

  if (context) {
    // Zenith down to nadir. The warm band sits just above v = 0.5 so the
    // glow reads as the sun below the skyline rather than a stripe.
    const sky = context.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0.0, '#0b1030');
    sky.addColorStop(0.26, '#232a5c');
    sky.addColorStop(0.4, '#5b3f74');
    sky.addColorStop(0.47, '#a85c6d');
    sky.addColorStop(0.5, '#e08a5f');
    sky.addColorStop(0.53, '#6d4a63');
    sky.addColorStop(0.72, '#241d2e');
    sky.addColorStop(1.0, '#141019');
    context.fillStyle = sky;
    context.fillRect(0, 0, W, H);

    // Sun glow, sitting on the horizon and off to one side so the lighting
    // has a direction the key light can agree with.
    const sunX = W * 0.72;
    const sunY = H * 0.5;
    const glow = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.42);
    glow.addColorStop(0, 'rgba(255, 214, 160, 0.95)');
    glow.addColorStop(0.25, 'rgba(255, 164, 110, 0.45)');
    glow.addColorStop(1, 'rgba(255, 140, 90, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, W, H);

    // A few soft cloud bands. Pure gradients read as a studio backdrop; these
    // give the sky enough structure to look like weather.
    context.globalAlpha = 0.14;
    context.fillStyle = '#f0c9a8';
    for (let i = 0; i < 7; i += 1) {
      const y = H * (0.3 + i * 0.03);
      const h = H * (0.012 + (i % 3) * 0.006);
      context.beginPath();
      context.ellipse(W * (0.2 + i * 0.12), y, W * (0.1 + (i % 4) * 0.05), h, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * A building facade, painted to a canvas.
 *
 * This replaces building windows out of geometry. Every reference
 * implementation of a convincing night/dusk city paints the facade instead —
 * a grid of window cells with randomised brightness — and uses it as both the
 * colour map and the emissive map. Geometry windows cost a draw call and a
 * mesh per band, never line up with the mass, and at distance read as shelves
 * rather than as glazing, which is exactly how the previous build failed.
 *
 * Painted, the whole facade is one material on one box: cheaper, and it has
 * the fine grain that makes a tower look inhabited.
 *
 * Returns both maps: `map` is dark glass with faint window outlines, and
 * `emissive` is black except where a window is lit, so only lit cells glow.
 */
function makeFacade(options: {
  cols: number;
  rows: number;
  litChance: number;
  seed: number;
  warm: boolean;
}): { map: CanvasTexture; emissive: CanvasTexture } {
  const { cols, rows, litChance, seed, warm } = options;
  /**
   * Cell proportions follow the one reference implementation that reads as
   * a city rather than as static: 128px across, ~18px per row, with the
   * window occupying 52% x 42% of its cell. The earlier 16px cells with a
   * 2px inset were nearly all glass — tiled 3x4 over a neighbour, that is
   * white noise, which is exactly what the previous build looked like.
   */
  const W = 128;
  const cw = W / cols;
  const ch = 18;
  const H = rows * ch;

  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const glow = document.createElement('canvas');
  glow.width = W;
  glow.height = H;

  const b = base.getContext('2d');
  const g = glow.getContext('2d');

  let st = seed >>> 0;
  const random = () => {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    return st / 0x7fffffff;
  };

  if (b && g) {
    b.fillStyle = '#0a0d14';
    b.fillRect(0, 0, W, H);
    g.fillStyle = '#000000';
    g.fillRect(0, 0, W, H);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = col * cw + cw * 0.24;
        const y = row * ch + ch * 0.28;
        const w = cw * 0.52;
        const h = ch * 0.42;

        if (random() < litChance) {
          // Lit windows vary in both hue and alpha, so no two read the same.
          // Alpha is the brightness control: it is what stops a lit facade
          // from being a wall of identical hot rectangles.
          const cool = random() > (warm ? 0.82 : 0.55);
          const fill = cool
            ? `rgba(168, 198, 255, ${(0.3 + random() * 0.3).toFixed(2)})`
            : `rgba(255, ${175 + Math.round(random() * 55)}, 118, ${(0.65 + random() * 0.35).toFixed(2)})`;
          b.fillStyle = fill;
          b.fillRect(x, y, w, h);
          g.fillStyle = fill;
          g.fillRect(x, y, w, h);
        } else {
          // Unlit glazing still shows as a faint pane, which is what keeps the
          // window grid legible on a dark building.
          b.fillStyle = 'rgba(28, 36, 52, 0.55)';
          b.fillRect(x, y, w, h);
        }
      }
    }
  }

  const map = new CanvasTexture(base);
  const emissive = new CanvasTexture(glow);
  for (const texture of [map, emissive]) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
  }
  return { map, emissive };
}

/**
 * Paving for the podium decks.
 *
 * The decks were untextured, so at the amenity camera distance they filled
 * the frame as one flat tone with nothing to read scale from. A slab joint
 * pattern is enough: it is 64x64 pixels, tiles, and costs no network request.
 */
function makePaving(): CanvasTexture {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const context = canvas.getContext('2d');

  if (context) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, S, S);
    // Joints slightly darker than the slab, never black — a hard black line
    // reads as a gap rather than as a joint.
    context.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    context.lineWidth = 2;
    context.strokeRect(0, 0, S, S);
    context.beginPath();
    context.moveTo(S / 2, 0);
    context.lineTo(S / 2, S);
    context.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(14, 11);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createTowerScene(
  canvas: HTMLCanvasElement,
  { reducedMotion }: SceneOptions,
): SceneHandle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x121110, 1);
  renderer.shadowMap.enabled = !reducedMotion;
  renderer.shadowMap.type = PCFSoftShadowMap;
  /**
   * ACES filmic tone mapping. Without it the warm key light and the emissive
   * windows clip to flat white at the top end, which is most of what made the
   * earlier build look like untextured blocks rather than a lit building.
   */
  renderer.toneMapping = ACESFilmicToneMapping;
  // Higher than before because the glow now has to come from exposure and
  // emissive alone — there is no bloom pass to lift it.
  renderer.toneMappingExposure = 1.4;

  const scene = new Scene();
  const environment = makeSky();
  scene.background = environment;
  scene.environment = environment;
  // Fog tinted to the horizon so the far blocks dissolve into the sky instead
  // of ending on a hard silhouette.
  // Exponential fog, not linear: distance falls off the way haze actually
  // does, and the far blocks dissolve into the dusk rather than hitting a
  // hard far plane.
  scene.fog = new FogExp2(0x3b2f4a, 0.0052);

  const camera = new PerspectiveCamera(42, 1, 0.5, 320);

  /**
   * No post-processing.
   *
   * A bloom pass was tried here and removed. The reference implementation
   * this scene follows gets its glow from `emissiveIntensity` and ACES tone
   * mapping alone, and in practice bloom did more harm than good: every
   * emissive surface — pool, gym interior, light strips — bled into a white
   * blob, and it added three full-screen passes to a scene that has to hold
   * 60fps on a mid-range phone.
   */

  // --- lighting -----------------------------------------------------------
  // Key light low and warm, placed to agree with the sun painted into the sky;
  // a key that disagrees with the backdrop is what makes a render look pasted.
  const key = new DirectionalLight(0xffd3a1, 3.1);
  key.position.set(34, 26, 20);
  key.castShadow = !reducedMotion;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 10;
  key.shadow.camera.far = 110;
  key.shadow.camera.left = -40;
  key.shadow.camera.right = 40;
  key.shadow.camera.top = 60;
  key.shadow.camera.bottom = -10;
  key.shadow.bias = -0.0012;
  scene.add(key);

  // Cool fill from the opposite side, so shadowed faces read as blue dusk
  // rather than as black.
  const fill = new DirectionalLight(0x8fa6ff, 0.8);
  fill.position.set(-26, 14, -18);
  scene.add(fill);

  // Hemisphere rather than ambient: the sky half is violet dusk, the ground
  // half near-black, so upward faces and downward faces no longer get the
  // same flat fill.
  scene.add(new HemisphereLight(0x6d5c92, 0x15101c, 0.95));

  // --- ground -------------------------------------------------------------
  const ground = new Mesh(
    new PlaneGeometry(420, 420),
    new MeshStandardMaterial({ color: 0x241e2b, roughness: 0.94, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = !reducedMotion;
  scene.add(ground);

  // --- tower --------------------------------------------------------------
  const tower = new Object3D();
  scene.add(tower);

  const slabGeometry = new BoxGeometry(TOWER_W, FLOOR_HEIGHT * 0.18, TOWER_D);
  const slabMaterial = new MeshStandardMaterial({
    color: 0xe8e2d8,
    roughness: 0.72,
    metalness: 0.04,
  });
  const slabs = new InstancedMesh(slabGeometry, slabMaterial, FLOOR_COUNT);
  slabs.castShadow = !reducedMotion;
  slabs.receiveShadow = !reducedMotion;
  tower.add(slabs);

  /**
   * The shaft: ONE continuous volume, not a box per floor.
   *
   * This is the fix for the tower reading as a stack of plates. Per-floor
   * glass boxes were 0.78 x FLOOR_HEIGHT tall on a 1.0 x FLOOR_HEIGHT pitch,
   * so there was a real gap at every level and the bright slab edge showed
   * through it — 34 floating trays rather than a building. A single mass that
   * grows in Y gives the tower continuous skin, and the floors are then
   * *expressed* on it by the slab lines and fins below rather than *made* of
   * them.
   */
  const towerFacade = makeFacade({
    cols: 6,
    rows: FLOOR_COUNT,
    litChance: 0.45,
    seed: 0x9e37,
    warm: true,
  });
  // Wrapped twice horizontally so the long faces get the same window pitch as
  // the short ones; one texture row per floor vertically.
  towerFacade.map.repeat.set(2, 1);
  towerFacade.emissive.repeat.set(2, 1);

  const shaftGeometry = new BoxGeometry(TOWER_W * 0.98, TOWER_HEIGHT, TOWER_D * 0.98);
  const shaftMaterial = new MeshStandardMaterial({
    map: towerFacade.map,
    emissiveMap: towerFacade.emissive,
    emissive: 0xffffff,
    /**
     * Above 1 deliberately: with ACES at exposure 1.4 this is what makes a
     * lit window read as a light source rather than as a pale rectangle.
     */
    emissiveIntensity: 1.8,
    roughness: 0.4,
    metalness: 0.5,
    transparent: true,
    opacity: 1,
  });
  const shaft = new Mesh(shaftGeometry, shaftMaterial);
  shaft.castShadow = !reducedMotion;
  tower.add(shaft);

  /**
   * Vertical fins.
   *
   * The single most important element for reading a residential tower: the
   * continuous pilasters that run the full height and give the facade its
   * grain. Without them a glazed box is just a box, which is what the previous
   * build was. They are narrow (0.3 units) so they read as pinstripes at
   * distance, and they break the lit floor bands into bays up close.
   */
  const finGeometry = new BoxGeometry(0.3, TOWER_HEIGHT, 0.3);
  const finMaterial = new MeshStandardMaterial({
    color: 0xcfc5b6,
    roughness: 0.55,
    metalness: 0.15,
  });
  /** Fin positions, computed once — they only ever scale in Y. */
  const FIN_OFFSETS: [number, number][] = [];
  {
    const perFace = 5;
    for (let i = 0; i < perFace; i += 1) {
      const t = i / (perFace - 1);
      const x = -TOWER_W / 2 + t * TOWER_W;
      FIN_OFFSETS.push([x, TOWER_D / 2]);
      FIN_OFFSETS.push([x, -TOWER_D / 2]);
    }
    // Side faces get the positions the corner run missed.
    FIN_OFFSETS.push([TOWER_W / 2, 0]);
    FIN_OFFSETS.push([-TOWER_W / 2, 0]);
  }

  const fins = new InstancedMesh(finGeometry, finMaterial, FIN_OFFSETS.length);
  fins.castShadow = !reducedMotion;
  tower.add(fins);

  /**
   * The per-floor "lit window" InstancedMesh that used to sit here is gone.
   * Those bands were geometry wrapped around the shaft, so they protruded as
   * rings and read as shelves rather than as glazing. The windows now live in
   * the facade's emissive map, which costs no geometry, no draw call, and
   * lines up with the mass by construction.
   */

  // Service core, revealed when the facade peels away in scene 3.
  const core = new Mesh(
    new BoxGeometry(2.1, FLOOR_COUNT * FLOOR_HEIGHT, 2.1),
    new MeshStandardMaterial({ color: 0x6d6353, roughness: 0.88 }),
  );
  core.position.y = (FLOOR_COUNT * FLOOR_HEIGHT) / 2;
  tower.add(core);

  /**
   * Crown. The earlier tower just stopped at the top floor, which is why it
   * read as a stack of shelves rather than as a building with a roofline.
   */
  const crown = new Mesh(
    new BoxGeometry(TOWER_W * 0.3, CROWN_HEIGHT, TOWER_D * 0.3),
    new MeshStandardMaterial({ color: 0xcfc4b4, roughness: 0.6, metalness: 0.2 }),
  );
  crown.castShadow = !reducedMotion;
  tower.add(crown);

  // --- the revealed floor plan (scene 3) ----------------------------------
  const planGroup = new Object3D();
  planGroup.visible = false;
  tower.add(planGroup);

  const wallMaterial = new MeshStandardMaterial({
    color: 0xd9cfc0,
    roughness: 0.9,
    transparent: true,
    opacity: 0,
  });
  const PLAN_WALLS: [number, number, number, number][] = [
    // [x, z, width, depth]
    [-1.9, 1.3, 3.0, 0.12],
    [2.0, 1.1, 2.6, 0.12],
    [0.1, -0.4, 0.12, 3.4],
    [0.2, -2.2, 4.4, 0.12],
  ];
  for (const [x, z, w, d] of PLAN_WALLS) {
    const wall = new Mesh(new BoxGeometry(w, 0.9, d), wallMaterial);
    wall.position.set(x, 0.45, z);
    planGroup.add(wall);
  }

  // Timber-toned floor, so the opened floor reads as a room and not as a void
  // between two slabs.
  const planFloor = new Mesh(
    new PlaneGeometry(TOWER_W * 0.88, TOWER_D * 0.88),
    new MeshStandardMaterial({
      color: 0xb08457,
      roughness: 0.78,
      transparent: true,
      opacity: 0,
    }),
  );
  planFloor.rotation.x = -Math.PI / 2;
  planFloor.position.y = 0.02;
  planGroup.add(planFloor);

  const interiorLight = new PointLight(0xffc98a, 0, 26, 2);
  tower.add(interiorLight);

  // --- surroundings -------------------------------------------------------
  const neighbourGeometry = new BoxGeometry(1, 1, 1);
  const NEIGHBOUR_COUNT = 26;

  /**
   * Three buckets of lit density, each its own facade and InstancedMesh.
   *
   * One texture at 30% lit, stretched 3x4 over every building, was the
   * previous version — and it read as television static. The reference does
   * two things this now copies: it gives each building ONE window grid per
   * face regardless of size (so no repeat), and it uses three densities so
   * that a dusk skyline has dark buildings in it as well as lit ones. Three
   * draw calls instead of one is the whole cost.
   */
  const cityFacades = [0.4, 0.25, 0.12].map((litChance, index) =>
    makeFacade({ cols: 6, rows: 14, litChance, seed: 0x5bd1 + index * 977, warm: false }),
  );
  const neighbourMaterials = cityFacades.map(
    (facade) =>
      new MeshStandardMaterial({
        map: facade.map,
        emissiveMap: facade.emissive,
        emissive: 0xffffff,
        // Dimmer than the hero tower: the subject of the shot has to be the
        // brightest thing in it.
        emissiveIntensity: 1.3,
        roughness: 0.92,
        metalness: 0,
      }),
  );
  const perBucket = Math.ceil(NEIGHBOUR_COUNT / cityFacades.length);
  const neighbourMeshes = neighbourMaterials.map((material) => {
    const mesh = new InstancedMesh(neighbourGeometry, material, perBucket);
    mesh.castShadow = !reducedMotion;
    mesh.receiveShadow = !reducedMotion;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });
  {
    // Deterministic placement — a random skyline that reshuffles on reload
    // would make the scene feel unstable between visits.
    const m = new Matrix4();
    const p = new Vector3();
    const q = new Quaternion();
    const sc = new Vector3();
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < NEIGHBOUR_COUNT; i += 1) {
      const angle = random() * Math.PI * 2;
      // Pushed out and kept low so the tower (height ~43) is unambiguously
      // the tallest thing in frame.
      const radius = 34 + random() * 54;
      const height = 5 + random() * 16;
      p.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      sc.set(4 + random() * 7, height, 4 + random() * 7);
      m.compose(p, q, sc);
      const mesh = neighbourMeshes[i % neighbourMeshes.length]!;
      mesh.setMatrixAt(mesh.count, m);
      mesh.count += 1;
    }
    for (const mesh of neighbourMeshes) mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Amenity podium.
   *
   * These were three identical flat teal quads, which is why the amenities
   * scenes read as coloured paper on black. Each is now built from the
   * material that identifies it: water is smooth and reflective so it mirrors
   * the sky, lawn is rough and matte, and the gym is a lit volume you can see
   * into.
   */
  const paving = makePaving();

  /**
   * Stepped terraces rather than one slab.
   *
   * The single 44x34 block read as a car park: one flat unlit plane filling
   * the frame with nothing on it. Stepping it, and running an illuminated
   * reveal along each edge, follows the reference's own vocabulary — a
   * "stepped silhouette" with "illuminated arches" — and gives the amenity
   * cameras an edge to catch light on.
   */
  const terrace = new Mesh(
    new BoxGeometry(54, 1.0, 42),
    new MeshStandardMaterial({ map: paving, color: 0x6f6478, roughness: 0.92 }),
  );
  terrace.position.set(0, 0.5, 8);
  terrace.receiveShadow = !reducedMotion;
  terrace.castShadow = !reducedMotion;
  scene.add(terrace);

  const deck = new Mesh(
    new BoxGeometry(42, 0.8, 30),
    new MeshStandardMaterial({ map: paving, color: 0x7d7186, roughness: 0.88 }),
  );
  deck.position.set(0, 1.4, 7);
  deck.receiveShadow = !reducedMotion;
  deck.castShadow = !reducedMotion;
  scene.add(deck);

  /**
   * Illuminated reveals under each step, plus brass coping on top. Basic
   * material because these are light sources; the brass is a real metal so it
   * picks up the dusk sky.
   */
  const revealMaterial = new MeshBasicMaterial({ color: 0xd9955a });
  const brass = new MeshStandardMaterial({ color: 0xc9a227, roughness: 0.28, metalness: 0.95 });

  for (const [w, d, x, z, y] of [
    [54.4, 42.4, 0, 8, 0.98],
    [42.4, 30.4, 0, 7, 1.78],
  ] as const) {
    const glowStrip = new Mesh(new BoxGeometry(w, 0.1, d), revealMaterial);
    glowStrip.position.set(x, y - 0.14, z);
    scene.add(glowStrip);

    const coping = new Mesh(new BoxGeometry(w + 0.5, 0.12, d + 0.5), brass);
    coping.position.set(x, y, z);
    scene.add(coping);
  }

  // Pool — low roughness and high metalness turn the sky texture into a
  // reflection, which is what makes it read as water rather than as paint.
  const pool = new Mesh(
    new BoxGeometry(15, 0.3, 7),
    new MeshStandardMaterial({
      color: 0x15617a,
      // Not a mirror. At 0.03 the sun reflected as a single hot spot that
      // read as a spotlight on the water; 0.14 spreads it into a sheen.
      roughness: 0.14,
      metalness: 0.8,
    }),
  );
  pool.position.set(-10, 1.84, 7);
  scene.add(pool);

  // Brass pool coping, and a warm uplight in the water.
  const poolRim = new Mesh(new BoxGeometry(16, 0.16, 8), brass);
  poolRim.position.set(-10, 1.8, 7);
  poolRim.receiveShadow = !reducedMotion;
  scene.add(poolRim);

  // Loungers along the water, so the deck reads as occupied.
  {
    const m = new Matrix4();
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();
    const loungers = new InstancedMesh(
      new BoxGeometry(0.8, 0.3, 2),
      new MeshStandardMaterial({ color: 0xd9cdbb, roughness: 0.8 }),
      8,
    );
    loungers.castShadow = !reducedMotion;
    for (let i = 0; i < 8; i += 1) {
      const side = i < 4 ? -1 : 1;
      p.set(-15 + (i % 4) * 3.4, 1.95, 7 + side * 4.6);
      s.setScalar(1);
      m.compose(p, q, s);
      loungers.setMatrixAt(i, m);
    }
    loungers.instanceMatrix.needsUpdate = true;
    scene.add(loungers);
  }

  /**
   * Gym pavilion.
   *
   * Previously one 9x3.4x7 box, which at this camera distance was a flat grey
   * rectangle — the "Gym" label was pointing at a slab. It is now built the
   * way the thing it represents is built: a lit floor, a ring of mullions, a
   * glazed skin over them and a brass-edged roof. The mullions are what give
   * it scale; a single transparent box has no features to read depth from.
   */
  const GYM = { x: 9.5, z: 3, w: 11, d: 8, h: 3.8, base: 1.8 };

  {
    const m = new Matrix4();
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();
    const mullionCount = 18;
    const mullions = new InstancedMesh(
      new BoxGeometry(0.16, GYM.h, 0.16),
      new MeshStandardMaterial({ color: 0x2a2230, roughness: 0.5, metalness: 0.6 }),
      mullionCount,
    );
    mullions.castShadow = !reducedMotion;
    for (let i = 0; i < mullionCount; i += 1) {
      // Walk the perimeter: long sides get more bays than the short ends.
      const half = mullionCount / 2;
      const along = (i % half) / (half - 1);
      const side = i < half ? -1 : 1;
      p.set(
        GYM.x - GYM.w / 2 + along * GYM.w,
        GYM.base + GYM.h / 2,
        GYM.z + (side * GYM.d) / 2,
      );
      s.setScalar(1);
      m.compose(p, q, s);
      mullions.setMatrixAt(i, m);
    }
    mullions.instanceMatrix.needsUpdate = true;
    scene.add(mullions);
  }

  const gymGlass = new Mesh(
    new BoxGeometry(GYM.w, GYM.h, GYM.d),
    new MeshStandardMaterial({
      color: 0x2b3b4a,
      // The pavilion glows from its own glass. The previous version lit it
      // with a MeshBasic floor slab plus a point light, which read as a white
      // plane with a blob under it once anything bright was in the scene.
      emissive: 0xffc98a,
      emissiveIntensity: 0.4,
      roughness: 0.2,
      metalness: 0.5,
      transparent: true,
      opacity: 0.6,
    }),
  );
  gymGlass.position.set(GYM.x, GYM.base + GYM.h / 2, GYM.z);
  scene.add(gymGlass);

  const gymRoof = new Mesh(
    new BoxGeometry(GYM.w + 1.2, 0.3, GYM.d + 1.2),
    new MeshStandardMaterial({ color: 0x241e2b, roughness: 0.85 }),
  );
  gymRoof.position.set(GYM.x, GYM.base + GYM.h + 0.15, GYM.z);
  gymRoof.castShadow = !reducedMotion;
  scene.add(gymRoof);

  const gymTrim = new Mesh(new BoxGeometry(GYM.w + 1.4, 0.1, GYM.d + 1.4), brass);
  gymTrim.position.set(GYM.x, GYM.base + GYM.h + 0.02, GYM.z);
  scene.add(gymTrim);

  // Garden — the reference calls its courtyard an English garden, so this is
  // lawn with real planting on it rather than a flat green rectangle.
  const garden = new Mesh(
    new BoxGeometry(22, 0.24, 13),
    new MeshStandardMaterial({ color: 0x3b6b3f, roughness: 0.97 }),
  );
  garden.position.set(-2, 1.92, 14);
  garden.receiveShadow = !reducedMotion;
  scene.add(garden);

  // A pale gravel path through the lawn, which gives the garden a direction.
  const path = new Mesh(
    new BoxGeometry(22, 0.06, 2.2),
    new MeshStandardMaterial({ color: 0xa79a86, roughness: 0.95 }),
  );
  path.position.set(-2, 2.05, 14);
  path.receiveShadow = !reducedMotion;
  scene.add(path);

  /**
   * Trees, as trunk + canopy rather than the single box the lawn had before.
   * Two instanced meshes is still two draw calls, and a canopy that sits above
   * a visible trunk is what separates "planting" from "green cube".
   */
  const trunkGeometry = new CylinderGeometry(0.12, 0.16, 1.5, 5);
  // Rounded and flat-shaded. Cones read as Christmas trees; a squashed
  // dodecahedron reads as a canopy.
  const canopyGeometry = new DodecahedronGeometry(1.15, 0);
  {
    const m = new Matrix4();
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();

    const TREES = 14;
    const trunks = new InstancedMesh(
      trunkGeometry,
      new MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 }),
      TREES,
    );
    const canopies = new InstancedMesh(
      canopyGeometry,
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.98, flatShading: true }),
      TREES,
    );
    canopies.castShadow = !reducedMotion;
    const greenA = new Color(0x2c4a31);
    const greenB = new Color(0x3d5c38);

    let seed = 41;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let i = 0; i < TREES; i += 1) {
      // Ring the deck and fill the garden, keeping clear of the pool and gym.
      const inGarden = i < 8;
      const x = inGarden ? -12 + random() * 20 : -24 + random() * 48;
      const z = inGarden ? 10 + random() * 8 : -6 + random() * 6;
      const scaleFactor = 0.8 + random() * 0.6;

      p.set(x, 2.05 + 0.75 * scaleFactor, z);
      s.setScalar(scaleFactor);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);

      p.set(x, 2.05 + (1.5 + 0.95) * scaleFactor, z);
      // Wider than tall, and never the same twice.
      s.set(
        scaleFactor * (1 + random() * 0.35),
        scaleFactor * (0.8 + random() * 0.2),
        scaleFactor * (1 + random() * 0.35),
      );
      m.compose(p, q, s);
      canopies.setMatrixAt(i, m);
      canopies.setColorAt(i, random() > 0.5 ? greenA : greenB);
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    scene.add(trunks);
    scene.add(canopies);
  }

  // --- per-frame state ----------------------------------------------------
  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const cameraPosition = new Vector3();
  const cameraTarget = new Vector3();
  const projected = new Vector3();

  let targetProgress = 0;
  let shownProgress = 0;
  let pointerX = 0;
  let pointerY = 0;
  let smoothPointerX = 0;
  let smoothPointerY = 0;
  let width = 1;
  let height = 1;
  let running = false;
  let frame = 0;
  let labelCallback: ((labels: LabelPosition[]) => void) | null = null;

  function sampleCamera(progress: number) {
    let index = 0;
    while (index < KEYFRAMES.length - 2 && KEYFRAMES[index + 1]!.at < progress) index += 1;

    const a = KEYFRAMES[index]!;
    const b = KEYFRAMES[index + 1]!;
    const span = b.at - a.at;
    const t = smoothstep(clamp01(span === 0 ? 0 : (progress - a.at) / span));

    cameraPosition.set(
      a.position[0] + (b.position[0] - a.position[0]) * t,
      a.position[1] + (b.position[1] - a.position[1]) * t,
      a.position[2] + (b.position[2] - a.position[2]) * t,
    );
    cameraTarget.set(
      a.target[0] + (b.target[0] - a.target[0]) * t,
      a.target[1] + (b.target[1] - a.target[1]) * t,
      a.target[2] + (b.target[2] - a.target[2]) * t,
    );
  }

  function updateFloors(progress: number) {
    /**
     * Floors stack bottom-up. Each floor owns a slice of the ramp, so they
     * arrive in sequence rather than together.
     *
     * The ramp starts at 0, not at 0.14. It used to begin where the Structure
     * scene begins, which meant the Arrival scene — the one headlined "A
     * single tower on Golf Course Road" — rendered an empty site with the
     * neighbours and no tower at all. Starting at 0 means the tower is already
     * rising as the camera makes its first orbit, and it tops out early in
     * the Structure scene with the crown.
     */
    const build = phase(progress, 0.0, 0.3);
    const visibleFloors = build * FLOOR_COUNT;

    for (let i = 0; i < FLOOR_COUNT; i += 1) {
      const local = clamp01(visibleFloors - i);
      const eased = smoothstep(local);
      const y = i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;

      // Slabs drop into place from slightly above, and scale in.
      position.set(0, y + (1 - eased) * 2.5, 0);
      scale.set(eased, eased === 0 ? 0.0001 : 1, eased);
      matrix.compose(position, quaternion, scale);
      slabs.setMatrixAt(i, matrix);

    }
    slabs.instanceMatrix.needsUpdate = true;

    /**
     * The shaft and the fins are continuous, so they grow rather than appear
     * floor by floor: scaled in Y with the base pinned to the ground. The
     * slab edges above still arrive one at a time, which is what reads as
     * assembly — the mass rising behind them is what stops it looking like a
     * stack of loose trays.
     */
    const grown = Math.max(0.0001, build);
    shaft.scale.y = grown;
    shaft.position.y = (TOWER_HEIGHT * grown) / 2;

    // The facade texture has to scale with the mass or the window grid
    // stretches as the tower rises.
    towerFacade.map.repeat.set(2, grown);
    towerFacade.emissive.repeat.set(2, grown);

    for (let i = 0; i < FIN_OFFSETS.length; i += 1) {
      const offset = FIN_OFFSETS[i]!;
      position.set(offset[0], (TOWER_HEIGHT * grown) / 2, offset[1]);
      scale.set(1, grown, 1);
      matrix.compose(position, quaternion, scale);
      fins.setMatrixAt(i, matrix);
    }
    fins.instanceMatrix.needsUpdate = true;

    core.scale.y = clamp01(build * 1.1);
    core.position.y = (core.scale.y * TOWER_HEIGHT) / 2;

    /**
     * The crown grows upward from the roof slab once the shaft is topped out.
     * Scaling it uniformly from its centre (the earlier version) made it
     * shrink away from the building and read as a separate object hovering
     * above the stack. Scaling Y only, with the base pinned to the roof,
     * keeps it attached the whole way up.
     */
    const topped = smoothstep(clamp01((build - 0.86) / 0.14));
    const roofY = FLOOR_COUNT * FLOOR_HEIGHT - FLOOR_HEIGHT * 0.5;
    crown.scale.set(1, topped === 0 ? 0.0001 : topped, 1);
    crown.position.y = roofY + (CROWN_HEIGHT * topped) / 2;
  }

  function updateReveal(progress: number) {
    // Facade dissolves as the camera pushes inside, and comes back on the way
    // out — driven by progress, so reversing the scroll reverses the reveal.
    const inside = phase(progress, 0.46, 0.58);
    const leaving = phase(progress, 0.62, 0.68);
    const openness = inside * (1 - leaving);

    shaftMaterial.opacity = 1 - openness * 0.92;
    shaftMaterial.depthWrite = shaftMaterial.opacity > 0.65;
    // The lit windows live in the facade's emissive map, so they fade with
    // the skin automatically — no separate band mesh to keep in step.
    shaftMaterial.emissiveIntensity = 1.8 * (1 - openness);

    wallMaterial.opacity = openness;
    planGroup.visible = openness > 0.01;
    // Sits on the floor the camera enters.
    planGroup.position.y = 17 * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.1;

    // Warm interior light, so the revealed floor reads as a home rather than
    // as a cutaway model.
    interiorLight.intensity = openness * 26;
    interiorLight.position.y = planGroup.position.y + 1.4;
  }

  function emitLabels(progress: number) {
    if (!labelCallback) return;

    const inside = phase(progress, 0.47, 0.56) * (1 - phase(progress, 0.6, 0.66));
    const labels: LabelPosition[] = [];

    for (const room of ROOM_LABELS) {
      projected.copy(room.position);
      projected.y += planGroup.position.y + 0.9;
      projected.project(camera);
      const onScreen =
        projected.z < 1 &&
        projected.x > -1.1 &&
        projected.x < 1.1 &&
        projected.y > -1.1 &&
        projected.y < 1.1;
      labels.push({
        id: room.id,
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
        visible: inside > 0.35 && onScreen,
      });
    }

    for (const anchor of AMENITY_ANCHORS) {
      projected.copy(anchor.position);
      projected.y += 1.2;
      projected.project(camera);
      const onScreen = projected.z < 1;
      // Each amenity label shows only around its own camera stop.
      const centre = anchor.id === 'pool' ? 0.7 : anchor.id === 'gym' ? 0.78 : 0.86;
      const near = 1 - clamp01(Math.abs(progress - centre) / 0.05);
      labels.push({
        id: anchor.id,
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
        visible: near > 0.2 && onScreen,
      });
    }

    labelCallback(labels);
  }

  function renderFrame(progress: number) {
    updateFloors(progress);
    updateReveal(progress);
    sampleCamera(progress);

    // Pointer parallax: a small camera offset perpendicular to the view. Kept
    // subtle and damped so it reads as life, not as a second control.
    camera.position.copy(cameraPosition);
    camera.position.x += smoothPointerX * 1.6;
    camera.position.y += smoothPointerY * 0.9;
    camera.lookAt(cameraTarget);

    renderer.render(scene, camera);
    emitLabels(progress);
  }

  function loop() {
    if (!running) return;
    frame = requestAnimationFrame(loop);

    // Critically-damped-ish easing. The 0.12 factor is the whole feel of the
    // scrub: lower drifts, higher snaps.
    const delta = targetProgress - shownProgress;
    smoothPointerX += (pointerX - smoothPointerX) * 0.08;
    smoothPointerY += (pointerY - smoothPointerY) * 0.08;

    if (Math.abs(delta) < 0.00015 && Math.abs(pointerX - smoothPointerX) < 0.002) {
      // Settled: stop re-rendering an identical frame. This is what keeps the
      // scene off the GPU while the user reads a panel.
      shownProgress = targetProgress;
      renderFrame(shownProgress);
      cancelAnimationFrame(frame);
      frame = 0;
      running = false;
      return;
    }

    shownProgress += delta * 0.12;
    renderFrame(shownProgress);
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    frame = requestAnimationFrame(loop);
  }

  return {
    setProgress(progress) {
      targetProgress = clamp01(progress);
      if (reducedMotion) {
        shownProgress = targetProgress;
        renderFrame(shownProgress);
        return;
      }
      start();
    },

    setPointer(x, y) {
      pointerX = x;
      pointerY = y;
      start();
    },

    setSize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      // Cap DPR: a 3x phone screen would otherwise render 9x the pixels for a
      // difference nobody can see on a scrolling scene.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setSize(nextWidth, nextHeight, false);
      renderFrame(shownProgress);
    },

    setRunning(shouldRun) {
      if (shouldRun) {
        start();
      } else {
        running = false;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      }
    },

    onLabels(callback) {
      labelCallback = callback;
    },

    dispose() {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      // Three does not free GPU memory on garbage collection; every geometry,
      // material and texture has to be released explicitly or a route change
      // leaks the whole scene.
      scene.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });
      slabGeometry.dispose();
      shaftGeometry.dispose();
      finGeometry.dispose();
      towerFacade.map.dispose();
      towerFacade.emissive.dispose();
      neighbourGeometry.dispose();
      for (const facade of cityFacades) {
        facade.map.dispose();
        facade.emissive.dispose();
      }
      trunkGeometry.dispose();
      canopyGeometry.dispose();
      environment.dispose();
      paving.dispose();
      renderer.dispose();
    },
  };
}
