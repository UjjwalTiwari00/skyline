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
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Fog,
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
  renderer.toneMappingExposure = 1.15;

  const scene = new Scene();
  const environment = makeSky();
  scene.background = environment;
  scene.environment = environment;
  // Fog tinted to the horizon so the far blocks dissolve into the sky instead
  // of ending on a hard silhouette.
  scene.fog = new Fog(HORIZON, 55, 190);

  const camera = new PerspectiveCamera(42, 1, 0.5, 320);

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

  scene.add(new AmbientLight(0x56618f, 0.9));

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

  const glassGeometry = new BoxGeometry(TOWER_W * 0.94, FLOOR_HEIGHT * 0.78, TOWER_D * 0.94);
  const glassMaterial = new MeshStandardMaterial({
    // Deep blue-green rather than neutral grey: glazing at dusk picks up the
    // sky, and the environment map now has a sky to pick up.
    color: 0x1d2b3a,
    roughness: 0.08,
    metalness: 0.96,
    transparent: true,
    opacity: 1,
  });
  const glass = new InstancedMesh(glassGeometry, glassMaterial, FLOOR_COUNT);
  glass.castShadow = !reducedMotion;
  tower.add(glass);

  /**
   * Lit windows.
   *
   * One warm band per floor, inset just inside the glazing. MeshBasicMaterial
   * because these are read as light sources, not lit surfaces — and because
   * `setColorAt` drives a basic material's output colour directly, which is
   * how each floor gets its own brightness. An emissive standard material
   * would have given all 34 floors the same glow, which reads as a strip
   * light rather than as apartments.
   */
  /**
   * Slightly WIDER than the glazing, not narrower.
   *
   * At 0.9 these sat inside a mirror-finish box and were completely hidden —
   * the warm stripes never appeared, and what read as colour on the facade was
   * the glass reflecting the pink sky. Protruding a hair past the glass turns
   * each floor into a visible band of light.
   */
  const bandGeometry = new BoxGeometry(TOWER_W * 0.97, FLOOR_HEIGHT * 0.26, TOWER_D * 0.97);
  const bandMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  const bands = new InstancedMesh(bandGeometry, bandMaterial, FLOOR_COUNT);
  {
    const warm = new Color();
    let seed = 19;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < FLOOR_COUNT; i += 1) {
      // Most floors are occupied and warm; a few sit dark, which is what stops
      // the facade looking like a uniform gradient.
      const occupied = random() > 0.18;
      // Capped below 1 so ACES does not roll the brightest floors to white;
      // the warmth is the point, and clipped highlights read as grey.
      const brightness = occupied ? 0.42 + random() * 0.38 : 0.05;
      warm.setRGB(1.0 * brightness, 0.74 * brightness, 0.46 * brightness);
      bands.setColorAt(i, warm);
    }
    if (bands.instanceColor) bands.instanceColor.needsUpdate = true;
  }
  tower.add(bands);

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
  const neighbourMaterial = new MeshStandardMaterial({
    color: 0x323b47,
    roughness: 0.88,
    metalness: 0.05,
  });
  const NEIGHBOUR_COUNT = 26;
  const neighbours = new InstancedMesh(neighbourGeometry, neighbourMaterial, NEIGHBOUR_COUNT);
  neighbours.castShadow = !reducedMotion;
  neighbours.receiveShadow = !reducedMotion;
  {
    // Deterministic placement — a random skyline that reshuffles on reload
    // would make the scene feel unstable between visits.
    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < NEIGHBOUR_COUNT; i += 1) {
      const angle = random() * Math.PI * 2;
      /**
       * Pushed out and kept low. At a radius of 18 and heights up to 22 the
       * neighbours crowded the base and the hero tower was just one block
       * among many — the Arrival frame had no subject. The tower reaches 43,
       * so capping these at ~21 keeps it unambiguously the tallest thing.
       */
      const radius = 34 + random() * 54;
      const height = 5 + random() * 16;
      position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      scale.set(4 + random() * 7, height, 4 + random() * 7);
      matrix.compose(position, quaternion, scale);
      neighbours.setMatrixAt(i, matrix);
    }
    neighbours.instanceMatrix.needsUpdate = true;
  }
  scene.add(neighbours);

  /**
   * Lit windows on the surrounding city.
   *
   * Without these the neighbours are unlit silhouettes, so the only inhabited
   * building at dusk is ours and the skyline reads as cardboard scenery. One
   * instanced band per neighbour, inset slightly, costs a single draw call.
   */
  const cityBandGeometry = new BoxGeometry(1, 1, 1);
  {
    const m = new Matrix4();
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();
    const colour = new Color();

    const BANDS_PER = 4;
    const total = NEIGHBOUR_COUNT * BANDS_PER;
    const cityBands = new InstancedMesh(
      cityBandGeometry,
      new MeshBasicMaterial({ color: 0xffffff }),
      total,
    );

    // Same seed sequence as the neighbours above, so the bands land on the
    // buildings rather than near them.
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    let index = 0;
    for (let i = 0; i < NEIGHBOUR_COUNT; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 34 + random() * 54;
      const height = 5 + random() * 16;
      const sx = 4 + random() * 7;
      const sz = 4 + random() * 7;
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;

      for (let b = 0; b < BANDS_PER; b += 1) {
        const t = (b + 1) / (BANDS_PER + 1);
        p.set(cx, height * t, cz);
        s.set(sx * 1.01, height * 0.055, sz * 1.01);
        m.compose(p, q, s);
        cityBands.setMatrixAt(index, m);

        const lit = random() > 0.3;
        const brightness = lit ? 0.18 + random() * 0.22 : 0.03;
        colour.setRGB(brightness, brightness * 0.76, brightness * 0.5);
        cityBands.setColorAt(index, colour);
        index += 1;
      }
    }
    cityBands.instanceMatrix.needsUpdate = true;
    if (cityBands.instanceColor) cityBands.instanceColor.needsUpdate = true;
    scene.add(cityBands);
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
  const revealMaterial = new MeshBasicMaterial({ color: 0xffb870 });
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
      roughness: 0.03,
      metalness: 0.85,
    }),
  );
  pool.position.set(-10, 1.84, 7);
  scene.add(pool);

  // Brass pool coping, and a warm uplight in the water.
  const poolRim = new Mesh(new BoxGeometry(16, 0.16, 8), brass);
  poolRim.position.set(-10, 1.8, 7);
  poolRim.receiveShadow = !reducedMotion;
  scene.add(poolRim);

  const poolLight = new PointLight(0x7fd4ff, 14, 22, 2);
  poolLight.position.set(-10, 2.6, 7);
  scene.add(poolLight);

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

  const gymFloor = new Mesh(
    new BoxGeometry(GYM.w, 0.12, GYM.d),
    new MeshBasicMaterial({ color: 0xffd9a8 }),
  );
  gymFloor.position.set(GYM.x, GYM.base + 0.06, GYM.z);
  scene.add(gymFloor);

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
      roughness: 0.06,
      metalness: 0.92,
      transparent: true,
      opacity: 0.4,
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

  const gymLight = new PointLight(0xffc98a, 22, 26, 2);
  gymLight.position.set(GYM.x, GYM.base + GYM.h * 0.6, GYM.z);
  scene.add(gymLight);

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
  const canopyGeometry = new ConeGeometry(1.1, 2.6, 7);
  {
    const m = new Matrix4();
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();

    const TREES = 22;
    const trunks = new InstancedMesh(
      trunkGeometry,
      new MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 }),
      TREES,
    );
    const canopies = new InstancedMesh(
      canopyGeometry,
      new MeshStandardMaterial({ color: 0x2f5a35, roughness: 0.98 }),
      TREES,
    );
    canopies.castShadow = !reducedMotion;

    let seed = 41;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let i = 0; i < TREES; i += 1) {
      // Ring the deck and fill the garden, keeping clear of the pool and gym.
      const inGarden = i < 12;
      const x = inGarden ? -12 + random() * 20 : -24 + random() * 48;
      const z = inGarden ? 10 + random() * 8 : -6 + random() * 6;
      const scaleFactor = 0.8 + random() * 0.6;

      p.set(x, 2.05 + 0.75 * scaleFactor, z);
      s.setScalar(scaleFactor);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);

      p.set(x, 2.05 + (1.5 + 1.3) * scaleFactor, z);
      m.compose(p, q, s);
      canopies.setMatrixAt(i, m);
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
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

      // Glass lags the slab by a fraction so the structure reads first.
      const glassEased = smoothstep(clamp01(local * 1.4 - 0.4));
      position.set(0, y, 0);
      scale.set(glassEased, glassEased === 0 ? 0.0001 : glassEased, glassEased);
      matrix.compose(position, quaternion, scale);
      glass.setMatrixAt(i, matrix);

      // Windows light up last, so a floor reads as built, then glazed, then
      // occupied — which is the order the copy describes.
      const litEased = smoothstep(clamp01(local * 2 - 1));
      position.set(0, y, 0);
      scale.set(litEased, litEased === 0 ? 0.0001 : litEased, litEased);
      matrix.compose(position, quaternion, scale);
      bands.setMatrixAt(i, matrix);
    }
    slabs.instanceMatrix.needsUpdate = true;
    glass.instanceMatrix.needsUpdate = true;
    bands.instanceMatrix.needsUpdate = true;

    core.scale.y = clamp01(build * 1.1);
    core.position.y = (core.scale.y * FLOOR_COUNT * FLOOR_HEIGHT) / 2;

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

    glassMaterial.opacity = 1 - openness * 0.93;
    glassMaterial.depthWrite = glassMaterial.opacity > 0.65;

    // The window bands have to fade with the glazing. Left opaque, they stayed
    // as solid glowing slabs hanging in the opened-up floor.
    bandMaterial.opacity = 1 - openness;
    bands.visible = bandMaterial.opacity > 0.02;

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
      glassGeometry.dispose();
      bandGeometry.dispose();
      neighbourGeometry.dispose();
      cityBandGeometry.dispose();
      trunkGeometry.dispose();
      canopyGeometry.dispose();
      environment.dispose();
      paving.dispose();
      renderer.dispose();
    },
  };
}
