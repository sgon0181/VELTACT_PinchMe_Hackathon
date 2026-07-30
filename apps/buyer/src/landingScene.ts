import * as THREE from "three";

type Vec3 = readonly [number, number, number];
type NumberKeyframe = readonly [number, number];
type VectorKeyframe = readonly [number, Vec3];
type StoryPhase = "intro" | "find" | "connect" | "deploy" | "outcome";

export interface FactoryStoryController {
  destroy(): void;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const smooth = (value: number) => value * value * (3 - 2 * value);

const segment = (progress: number, start: number, end: number) =>
  smooth(clamp((progress - start) / (end - start), 0, 1));

function numberAt(progress: number, keyframes: readonly NumberKeyframe[]) {
  if (progress <= keyframes[0][0]) {
    return keyframes[0][1];
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (progress <= next[0]) {
      const amount = smooth((progress - current[0]) / (next[0] - current[0]));
      return current[1] + (next[1] - current[1]) * amount;
    }
  }

  return keyframes[keyframes.length - 1][1];
}

function vectorAt(progress: number, keyframes: readonly VectorKeyframe[]): Vec3 {
  if (progress <= keyframes[0][0]) {
    return keyframes[0][1];
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (progress <= next[0]) {
      const amount = smooth((progress - current[0]) / (next[0] - current[0]));
      return [
        current[1][0] + (next[1][0] - current[1][0]) * amount,
        current[1][1] + (next[1][1] - current[1][1]) * amount,
        current[1][2] + (next[1][2] - current[1][2]) * amount,
      ];
    }
  }

  return keyframes[keyframes.length - 1][1];
}

function createTimedCameraCurve(keyframes: readonly VectorKeyframe[]) {
  return new THREE.CatmullRomCurve3(
    keyframes.map(([, value]) => new THREE.Vector3(...value)),
    false,
    "centripetal",
  );
}

function cameraCurveAt(
  progress: number,
  keyframes: readonly VectorKeyframe[],
  curve: THREE.CatmullRomCurve3,
  target: THREE.Vector3,
) {
  if (progress <= keyframes[0][0]) {
    return target.set(...keyframes[0][1]);
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (progress <= next[0]) {
      // Uneven keyframe timing creates station dwells without stopping the spline.
      const segmentProgress = (progress - current[0]) / (next[0] - current[0]);
      const curveProgress = (index + segmentProgress) / (keyframes.length - 1);
      return curve.getPoint(curveProgress, target);
    }
  }

  return target.set(...keyframes[keyframes.length - 1][1]);
}

function panelOpacity(progress: number, start: number, end: number) {
  const fadeIn = start <= 0 ? 1 : segment(progress, start, start + 0.025);
  const fadeOut = end >= 1 ? 1 : 1 - segment(progress, end - 0.025, end);
  return Math.min(fadeIn, fadeOut);
}

function requiredElement<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Factory story is missing ${selector}`);
  }
  return element;
}

export function createFactoryStory(root: HTMLElement): FactoryStoryController {
  const stage = requiredElement<HTMLElement>(root, "[data-factory-stage]");
  const canvasHost = requiredElement<HTMLElement>(root, "[data-factory-canvas]");
  const progressLabel = requiredElement<HTMLElement>(root, "[data-story-progress]");
  const hint = requiredElement<HTMLElement>(root, "[data-story-hint]");
  const panels = new Map<StoryPhase, HTMLElement>(
    Array.from(root.querySelectorAll<HTMLElement>("[data-story-panel]")).map((panel) => [
      panel.dataset.storyPanel as StoryPhase,
      panel,
    ]),
  );
  const railItems = new Map<Exclude<StoryPhase, "intro" | "outcome">, HTMLElement>(
    Array.from(root.querySelectorAll<HTMLElement>("[data-story-rail]")).map((item) => [
      item.dataset.storyRail as Exclude<StoryPhase, "intro" | "outcome">,
      item,
    ]),
  );

  const renderer = new THREE.WebGLRenderer({
    alpha: false,
    antialias: window.innerWidth >= 720,
    powerPreference: "high-performance",
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.domElement.setAttribute("aria-hidden", "true");
  canvasHost.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040a11);
  scene.fog = new THREE.Fog(0x07111d, 30, 142);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  const material = (
    color: number,
    options: THREE.MeshStandardMaterialParameters = {},
  ) =>
    new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      metalness: 0.08,
      roughness: 0.88,
      ...options,
    });

  const materials = {
    platform: material(0x123a5a),
    road: material(0x07111d),
    machine: material(0x2a3b4c),
    machineDark: material(0x16283c),
    dark: material(0x040a11),
    belt: material(0x0a1522),
    metal: material(0xa9b5bf, { metalness: 0.55, roughness: 0.42 }),
    glass: material(0x8796a3, { flatShading: false, roughness: 0.32 }),
    base: material(0xc3cfd9, { metalness: 0.55, roughness: 0.4 }),
    red: material(0xd6283f, { roughness: 0.58 }),
    crimson: material(0x7a1425, { metalness: 0.32, roughness: 0.52 }),
    white: material(0xf3f6f8, { roughness: 0.5 }),
  };

  const box = (
    width: number,
    height: number,
    depth: number,
    boxMaterial: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = scene,
    noShadow = false,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      boxMaterial,
    );
    mesh.position.set(x, y, z);
    if (!noShadow) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    parent.add(mesh);
    return mesh;
  };

  const cylinder = (
    radiusTop: number,
    radiusBottom: number,
    height: number,
    cylinderMaterial: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = scene,
    segments = 10,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
      cylinderMaterial,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  scene.add(new THREE.HemisphereLight(0x2468a2, 0x040a11, 1.3));
  const rimLight = new THREE.DirectionalLight(0x8fc8f5, 1.45);
  rimLight.position.set(-14, 16, -30);
  scene.add(rimLight);

  const keyLight = new THREE.DirectionalLight(0xf3f6f8, 2.65);
  keyLight.position.set(18, 32, 20);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, {
    left: -32,
    right: 36,
    top: 22,
    bottom: -18,
    near: 5,
    far: 90,
  });
  keyLight.target.position.set(24, 0, 0);
  scene.add(keyLight, keyLight.target);

  const floor = box(94, 1.2, 15, materials.platform, 39, -0.6, 0);
  floor.receiveShadow = true;
  box(58, 0.06, 0.1, materials.red, 23, 0.04, 7.44, scene, true);
  box(44, 0.8, 3.6, materials.road, 61, -0.4, 3.4);

  const basePoints = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.125, 0)];
  for (let index = 0; index < 6; index += 1) {
    basePoints.push(
      new THREE.Vector2(index % 2 ? 0.112 : 0.145, 0.05 + index * 0.047),
    );
  }
  basePoints.push(new THREE.Vector2(0.105, 0.33));
  const bulbBaseGeometry = new THREE.LatheGeometry(basePoints, 16);
  const glassPoints = [
    [0.105, 0.32],
    [0.125, 0.4],
    [0.185, 0.5],
    [0.3, 0.61],
    [0.385, 0.75],
    [0.4, 0.88],
    [0.345, 1.02],
    [0.21, 1.13],
    [0.001, 1.18],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bulbGlassGeometry = new THREE.LatheGeometry(glassPoints, 28);
  bulbGlassGeometry.computeVertexNormals();

  const heroGlass = new THREE.MeshStandardMaterial({
    color: 0xd6283f,
    emissive: new THREE.Color(0x7a1425),
    emissiveIntensity: 0.72,
    opacity: 0.92,
    roughness: 0.3,
    transparent: true,
  });

  const makeBulb = (
    glassMaterial: THREE.Material,
    baseMaterial: THREE.Material = materials.base,
  ) => {
    const group = new THREE.Group();
    const base = new THREE.Mesh(bulbBaseGeometry, baseMaterial);
    const glass = new THREE.Mesh(bulbGlassGeometry, glassMaterial);
    base.castShadow = true;
    glass.castShadow = true;
    group.add(base, glass);
    return group;
  };

  box(2.9, 0.15, 2.9, materials.machineDark, 0, 0.72, 0);
  for (const [x, z] of [
    [-1.3, -1.3],
    [1.3, -1.3],
    [-1.3, 1.3],
    [1.3, 1.3],
  ]) {
    box(0.18, 0.72, 0.18, materials.dark, x, 0.36, z);
  }
  box(2.9, 0.55, 0.12, materials.machineDark, 0, 1.05, -1.45);
  box(2.9, 0.55, 0.12, materials.machineDark, 0, 1.05, 1.45);
  box(0.12, 0.55, 2.9, materials.machineDark, -1.45, 1.05, 0);
  box(0.12, 0.55, 2.9, materials.machineDark, 1.45, 1.05, 0);

  const sourceX = 0.3;
  const sourceZ = -0.3;
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      const x = -0.9 + column * 0.6;
      const z = -0.9 + row * 0.6;
      if (Math.abs(x - sourceX) < 0.01 && Math.abs(z - sourceZ) < 0.01) {
        continue;
      }
      const bulb = makeBulb(materials.glass);
      bulb.position.set(x, 0.8, z);
      bulb.rotation.y = column * 1.3 + row * 0.7;
      scene.add(bulb);
    }
  }

  const heroBulb = makeBulb(heroGlass, materials.crimson);
  heroBulb.position.set(sourceX, 0.8, sourceZ);
  scene.add(heroBulb);

  const filamentMaterial = new THREE.MeshStandardMaterial({
    color: 0x7a1425,
    emissive: 0xe6a63f,
    emissiveIntensity: 0.14,
  });
  cylinder(0.012, 0.012, 0.26, filamentMaterial, -0.05, 0.47, 0, heroBulb, 5);
  cylinder(0.012, 0.012, 0.26, filamentMaterial, 0.05, 0.47, 0, heroBulb, 5);
  const filament = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.016, 5, 14),
    filamentMaterial,
  );
  filament.rotation.x = Math.PI / 2;
  filament.position.y = 0.62;
  heroBulb.add(filament);

  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const glowContext = glowCanvas.getContext("2d");
  if (!glowContext) {
    throw new Error("Canvas 2D rendering is unavailable");
  }
  const glowGradient = glowContext.createRadialGradient(64, 64, 2, 64, 64, 62);
  glowGradient.addColorStop(0, "rgba(243, 246, 248, 0.92)");
  glowGradient.addColorStop(0.35, "rgba(230, 166, 63, 0.34)");
  glowGradient.addColorStop(1, "rgba(230, 166, 63, 0)");
  glowContext.fillStyle = glowGradient;
  glowContext.fillRect(0, 0, 128, 128);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glowMaterial = new THREE.SpriteMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: glowTexture,
    opacity: 0,
    transparent: true,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.scale.set(3, 3, 1);
  scene.add(glow);

  const scanMaterial = new THREE.MeshBasicMaterial({
    color: 0xd6283f,
    opacity: 0,
    transparent: true,
  });
  const scan = box(3, 0.03, 0.5, scanMaterial, 0, 1.62, 0, scene, true);
  const reticleMaterial = new THREE.MeshBasicMaterial({
    color: 0xd6283f,
    opacity: 0,
    transparent: true,
  });
  const reticle = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.025, 6, 24),
    reticleMaterial,
  );
  reticle.rotation.x = Math.PI / 2;
  reticle.position.set(sourceX, 2, sourceZ);
  scene.add(reticle);

  const upperArmLength = 2.4;
  const lowerArmLength = 2.2;
  const pivot = new THREE.Vector3(2.4, 1.2, 2.4);
  cylinder(0.55, 0.7, 0.25, materials.machineDark, pivot.x, 0.12, pivot.z, scene, 12);
  cylinder(0.4, 0.48, 1.1, materials.machine, pivot.x, 0.68, pivot.z, scene, 12);
  const yawGroup = new THREE.Group();
  yawGroup.position.copy(pivot);
  scene.add(yawGroup);
  box(0.7, 0.55, 0.55, materials.machine, 0, 0.1, 0, yawGroup);
  const upperGroup = new THREE.Group();
  upperGroup.position.y = 0.25;
  yawGroup.add(upperGroup);
  box(upperArmLength, 0.3, 0.3, materials.machine, upperArmLength / 2, 0, 0, upperGroup);
  const elbowGroup = new THREE.Group();
  elbowGroup.position.x = upperArmLength;
  upperGroup.add(elbowGroup);
  const elbow = cylinder(0.22, 0.22, 0.5, materials.machineDark, 0, 0, 0, elbowGroup, 10);
  elbow.rotation.x = Math.PI / 2;
  box(lowerArmLength, 0.24, 0.24, materials.machine, lowerArmLength / 2, 0, 0, elbowGroup);
  const sensorMaterial = new THREE.MeshStandardMaterial({
    color: 0x7a1425,
    emissive: 0xd6283f,
    emissiveIntensity: 0,
  });
  const sensor = box(
    0.14,
    0.14,
    0.14,
    sensorMaterial,
    lowerArmLength * 0.65,
    -0.2,
    0,
    elbowGroup,
    true,
  );
  const tipGroup = new THREE.Group();
  tipGroup.position.x = lowerArmLength;
  elbowGroup.add(tipGroup);
  const gripGroup = new THREE.Group();
  tipGroup.add(gripGroup);
  box(0.3, 0.28, 0.34, materials.machineDark, 0, -0.14, 0, gripGroup);
  const fingerOne = box(0.06, 0.42, 0.09, materials.metal, 0, -0.45, 0.14, gripGroup);
  const fingerTwo = box(0.06, 0.42, 0.09, materials.metal, 0, -0.45, -0.14, gripGroup);
  const tipWorld = new THREE.Vector3();

  const solveArm = (target: Vec3) => {
    const deltaX = target[0] - pivot.x;
    const deltaZ = target[2] - pivot.z;
    const radius = Math.hypot(deltaX, deltaZ);
    const height = target[1] - pivot.y - 0.25;
    const distance = clamp(
      Math.hypot(radius, height),
      0.6,
      upperArmLength + lowerArmLength - 0.05,
    );
    const shoulder = Math.acos(
      clamp(
        (upperArmLength ** 2 + distance ** 2 - lowerArmLength ** 2) /
          (2 * upperArmLength * distance),
        -1,
        1,
      ),
    );
    const elbowAngle = Math.acos(
      clamp(
        (upperArmLength ** 2 + lowerArmLength ** 2 - distance ** 2) /
          (2 * upperArmLength * lowerArmLength),
        -1,
        1,
      ),
    );
    yawGroup.rotation.y = -Math.atan2(deltaZ, deltaX);
    upperGroup.rotation.z = Math.atan2(height, radius) + shoulder;
    elbowGroup.rotation.z = -(Math.PI - elbowAngle);
    gripGroup.rotation.z = -(upperGroup.rotation.z + elbowGroup.rotation.z);
    yawGroup.updateMatrixWorld(true);
    tipGroup.getWorldPosition(tipWorld);
  };

  const armKeyframes: readonly VectorKeyframe[] = [
    [0.05, [3.6, 3.3, 0.9]],
    [0.115, [0, 3.8, 0]],
    [0.155, [sourceX, 3.1, sourceZ]],
    [0.195, [sourceX, 2.6, sourceZ]],
    [0.218, [sourceX, 2.13, sourceZ]],
    [0.255, [sourceX, 3.6, sourceZ]],
    [0.305, [4, 3.65, 0]],
    [0.39, [3.6, 3.3, 0.9]],
  ];

  box(39, 0.5, 1.4, materials.belt, 23, 2.05, 0);
  for (let x = 5; x <= 41; x += 4.5) {
    box(0.25, 1.8, 0.25, materials.dark, x, 0.9, 0.5);
    box(0.25, 1.8, 0.25, materials.dark, x, 0.9, -0.5);
  }
  box(39, 0.1, 0.08, materials.machineDark, 23, 2.36, 0.72);
  box(39, 0.1, 0.08, materials.machineDark, 23, 2.36, -0.72);
  const beltStripes = Array.from({ length: 13 }, () =>
    box(0.2, 0.03, 1.3, materials.dark, 4, 2.31, 0, scene, true),
  );

  box(0.35, 6, 0.35, materials.machine, 24, 3, 1.6);
  box(0.35, 6, 0.35, materials.machine, 24, 3, -1.6);
  box(0.3, 0.3, 3.6, materials.machine, 24, 6, 0);
  cylinder(0.05, 0.05, 1.05, materials.dark, 24, 5.32, 0, scene, 6);
  cylinder(0.26, 0.3, 0.45, materials.metal, 24, 4.6, 0);
  const lifter = cylinder(0.28, 0.34, 1, materials.machineDark, 24, 2.3, 0);
  const heroLight = new THREE.PointLight(0xe6a63f, 0, 15, 2);
  scene.add(heroLight);

  box(2.2, 0.18, 1.7, materials.machine, 43, 1.42, 0);
  for (const [x, z] of [
    [-0.9, -0.6],
    [0.9, -0.6],
    [-0.9, 0.6],
    [0.9, 0.6],
  ]) {
    box(0.16, 1.4, 0.16, materials.dark, 43 + x, 0.7, z);
  }

  const crate = new THREE.Group();
  scene.add(crate);
  box(1, 0.1, 1, materials.crimson, 0, 0.05, 0, crate);
  box(1, 0.7, 0.08, materials.crimson, 0, 0.45, -0.46, crate);
  box(1, 0.7, 0.08, materials.crimson, 0, 0.45, 0.46, crate);
  box(0.08, 0.7, 1, materials.crimson, -0.46, 0.45, 0, crate);
  box(0.08, 0.7, 1, materials.crimson, 0.46, 0.45, 0, crate);
  const crateGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xe6a63f,
    opacity: 0,
    transparent: true,
  });
  box(0.9, 0.04, 0.9, crateGlowMaterial, 0, 0.82, 0, crate, true);
  const lidGroup = new THREE.Group();
  lidGroup.position.set(0, 0.82, -0.5);
  crate.add(lidGroup);
  box(1.08, 0.09, 1.08, materials.crimson, 0, 0.045, 0.5, lidGroup);

  const van = new THREE.Group();
  van.position.set(47.5, 0, 3.4);
  scene.add(van);
  box(3, 1.3, 1.5, materials.machine, -0.2, 1.2, 0, van);
  box(0.95, 0.95, 1.4, materials.machineDark, 1.75, 1.02, 0, van);
  box(0.9, 0.4, 1.3, materials.dark, 1.78, 1.62, 0, van, true);
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b222a,
    emissive: 0xf3f6f8,
    emissiveIntensity: 0,
  });
  box(0.08, 0.14, 0.22, headlightMaterial, 2.24, 0.85, 0.45, van, true);
  box(0.08, 0.14, 0.22, headlightMaterial, 2.24, 0.85, -0.45, van, true);
  box(0.1, 0.1, 1.3, materials.red, -1.72, 0.9, 0, van, true);
  const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10);
  wheelGeometry.rotateX(Math.PI / 2);
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [
    [1.6, 0.85],
    [1.6, -0.85],
    [-1.1, 0.85],
    [-1.1, -0.85],
  ]) {
    const wheel = new THREE.Mesh(wheelGeometry, materials.dark);
    wheel.position.set(x, 0.34, z);
    wheel.castShadow = true;
    van.add(wheel);
    wheels.push(wheel);
  }
  const leftDoor = new THREE.Group();
  leftDoor.position.set(-1.72, 1.2, 0.75);
  van.add(leftDoor);
  box(0.08, 1.24, 0.72, materials.machineDark, 0, 0, -0.36, leftDoor);
  const rightDoor = new THREE.Group();
  rightDoor.position.set(-1.72, 1.2, -0.75);
  van.add(rightDoor);
  box(0.08, 1.24, 0.72, materials.machineDark, 0, 0, 0.36, rightDoor);

  box(7, 6, 6, materials.machine, 84, 3, 3);
  box(4, 3.2, 5, materials.machineDark, 79.5, 1.6, 5.5);
  box(7.4, 0.35, 6.4, materials.machineDark, 84, 6.15, 3);
  cylinder(0.5, 0.6, 3.2, materials.machineDark, 85.5, 7.4, 1.8, scene, 10);
  box(2.6, 0.55, 0.14, materials.red, 80.42, 5.3, 3, scene, true);
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x123a5a,
    emissive: 0xe6a63f,
    emissiveIntensity: 0,
    flatShading: true,
  });
  box(0.12, 1.5, 1.2, windowMaterial, 80.45, 3.4, 3.2, scene, true);
  const factoryLight = new THREE.PointLight(0xe6a63f, 0, 22, 2);
  factoryLight.position.set(79.2, 3.4, 3.2);
  scene.add(factoryLight);

  for (const x of [2, 14, 28, 40]) {
    box(0.14, 3.4, 0.14, materials.dark, x, 1.7, -3.1);
    box(0.5, 0.12, 0.3, materials.machineDark, x, 3.42, -2.95);
    box(0.3, 0.06, 0.2, materials.white, x, 3.34, -2.95, scene, true);
  }
  for (const x of [10, 19, 37]) {
    box(0.22, 5.2, 0.22, materials.machine, x, 2.6, 2.9);
    box(0.22, 5.2, 0.22, materials.machine, x, 2.6, -2.9);
    box(0.26, 0.3, 6.1, materials.machineDark, x, 5.25, 0);
    box(0.14, 0.05, 3.4, materials.white, x, 5.07, 0, scene, true);
  }
  box(36, 0.35, 1.1, materials.belt, 22, 1.5, -5.6);
  for (let x = 6; x <= 38; x += 5) {
    box(0.2, 1.35, 0.2, materials.dark, x, 0.67, -5.2);
    box(0.2, 1.35, 0.2, materials.dark, x, 0.67, -6);
  }
  const backgroundParts = Array.from({ length: 8 }, (_, index) =>
    index % 2
      ? box(0.5, 0.4, 0.5, materials.machine, 0, 1.9, -5.6)
      : cylinder(0.24, 0.24, 0.45, materials.metal, 0, 1.9, -5.6, scene, 8),
  );
  box(24, 0.12, 1, materials.machineDark, 23, 3.8, -4.6);
  for (let x = 12; x <= 34; x += 5.5) {
    box(0.22, 3.8, 0.22, materials.dark, x, 1.9, -4.6);
  }

  const cameraPositions: readonly VectorKeyframe[] = [
    [0, [28, 24, 44]],
    [0.07, [10, 8, 16]],
    [0.11, [6.5, 5.5, 11]],
    [0.18, [-4.5, 4.6, 9.5]],
    [0.26, [1.5, 4.2, 10.5]],
    [0.31, [6, 4.4, 10.5]],
    [0.4, [16, 4.2, 10]],
    [0.47, [27.5, 4.4, 9.5]],
    [0.55, [28.6, 5.2, 7.2]],
    [0.62, [27.4, 5.4, 6]],
    [0.68, [28, 4.6, 10.5]],
    [0.75, [45, 4.2, 10]],
    [0.82, [48.2, 3.8, 9.5]],
    [0.88, [51, 5.2, 12.5]],
    [1, [50, 16, 28]],
  ];
  const cameraTargets: readonly VectorKeyframe[] = [
    [0, [30, 1, 0]],
    [0.07, [2, 2, 0]],
    [0.11, [0.5, 1.8, 0]],
    [0.18, [0.3, 1.9, 0]],
    [0.26, [2.5, 2.3, 0]],
    [0.31, [4.5, 2.5, 0]],
    [0.4, [14.5, 2.6, 0]],
    [0.47, [24, 3, 0]],
    [0.55, [24, 4, 0]],
    [0.62, [24, 4.1, 0]],
    [0.68, [28, 2.4, 0]],
    [0.75, [43, 2, 0]],
    [0.82, [44.5, 1.6, 0.8]],
    [0.88, [48, 1.5, 2.5]],
    [1, [72, 3, 3]],
  ];
  const cameraPositionCurve = createTimedCameraCurve(cameraPositions);
  const cameraTargetCurve = createTimedCameraCurve(cameraTargets);
  const cameraPosition = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const gripperReleaseProgress = 0.305;
  solveArm(vectorAt(gripperReleaseProgress, armKeyframes));
  const gripperReleasePosition: Vec3 = [
    tipWorld.x,
    tipWorld.y - 1.35,
    tipWorld.z,
  ];
  const bulbPositions: readonly VectorKeyframe[] = [
    [gripperReleaseProgress, gripperReleasePosition],
    [0.455, [24, 2.3, 0]],
    [0.5, [24, 2.3, 0]],
    [0.53, [24, 3.35, 0]],
    [0.585, [24, 3.55, 0]],
    [0.645, [24, 3.55, 0]],
    [0.685, [24, 2.3, 0]],
    [0.7, [24, 2.3, 0]],
    [0.755, [42, 2.3, 0]],
    [0.775, [43, 2.15, 0]],
    [0.795, [43, 1.6, 0]],
  ];
  const cratePositions: readonly VectorKeyframe[] = [
    [0, [43, 1.5, 0]],
    [0.84, [43, 1.5, 0]],
    [0.858, [44.8, 1.1, 1.7]],
    [0.878, [46.3, 0.62, 3.4]],
  ];
  const panelWindows = new Map<StoryPhase, readonly [number, number]>([
    ["intro", [0, 0.11]],
    ["find", [0.09, 0.39]],
    ["connect", [0.37, 0.71]],
    ["deploy", [0.69, 0.94]],
    ["outcome", [0.92, 1]],
  ]);

  const updateInterface = (progress: number) => {
    for (const [phase, panel] of panels) {
      const window = panelWindows.get(phase);
      const opacity = window ? panelOpacity(progress, window[0], window[1]) : 0;
      panel.style.setProperty("--story-opacity", opacity.toFixed(3));
      panel.style.setProperty("--story-shift", `${((1 - opacity) * 16).toFixed(1)}px`);
      panel.setAttribute("aria-hidden", opacity >= 0.5 ? "false" : "true");
    }

    const activePhase = progress < 0.37 ? "find" : progress < 0.69 ? "connect" : "deploy";
    const phaseOrder: Array<Exclude<StoryPhase, "intro" | "outcome">> = [
      "find",
      "connect",
      "deploy",
    ];
    const activeIndex = phaseOrder.indexOf(activePhase);
    phaseOrder.forEach((phase, index) => {
      const item = railItems.get(phase);
      item?.classList.toggle("is-active", index === activeIndex);
      item?.classList.toggle("is-complete", index < activeIndex);
    });

    progressLabel.textContent = `${String(Math.round(progress * 100)).padStart(3, "0")}%`;
    hint.style.opacity = String(1 - segment(progress, 0.005, 0.045));
  };

  const updateScene = (progress: number) => {
    cameraCurveAt(progress, cameraPositions, cameraPositionCurve, cameraPosition);
    cameraCurveAt(progress, cameraTargets, cameraTargetCurve, cameraTarget);
    const narrow = stage.clientWidth < 720;
    camera.fov = narrow ? 49 : 42;
    camera.position.set(
      cameraPosition.x,
      cameraPosition.y + (narrow ? 0.8 : 0),
      cameraPosition.z + (narrow ? 4.5 : 0),
    );
    camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z);
    camera.updateProjectionMatrix();

    solveArm(vectorAt(progress, armKeyframes));
    const gripGap = numberAt(progress, [
      [0.18, 0.2],
      [0.215, 0.06],
      [0.3, 0.06],
      [0.315, 0.2],
    ]);
    fingerOne.position.z = gripGap;
    fingerTwo.position.z = -gripGap;
    sensorMaterial.emissiveIntensity = numberAt(progress, [
      [0.08, 0],
      [0.1, 1.6],
      [0.24, 1.6],
      [0.28, 0],
    ]);

    scan.position.z = numberAt(progress, [
      [0.095, -1.25],
      [0.15, 1.25],
    ]);
    scanMaterial.opacity =
      0.4 *
      Math.min(segment(progress, 0.093, 0.105), 1 - segment(progress, 0.14, 0.152));
    reticleMaterial.opacity = Math.min(
      segment(progress, 0.145, 0.16),
      1 - segment(progress, 0.2, 0.215),
    );
    const reticlePulse = 1 + 0.18 * Math.sin(progress * 620);
    reticle.scale.set(reticlePulse, reticlePulse, 1);

    if (progress > 0.218 && progress <= gripperReleaseProgress) {
      heroBulb.position.set(tipWorld.x, tipWorld.y - 1.35, tipWorld.z);
    } else if (progress <= 0.218) {
      heroBulb.position.set(sourceX, 0.8, sourceZ);
    } else if (progress < 0.8) {
      const position = vectorAt(progress, bulbPositions);
      heroBulb.position.set(position[0], position[1], position[2]);
    }
    heroBulb.rotation.y = Math.PI * 6 * segment(progress, 0.55, 0.585);

    const ignitionEnvelope = segment(progress, 0.578, 0.602);
    const lit =
      progress < 0.578
        ? 0
        : progress > 0.602
          ? 1
          : ignitionEnvelope * (Math.sin(progress * 2600) > -0.35 ? 1 : 0.15);
    const packed = segment(progress, 0.83, 0.86);
    heroLight.intensity = 34 * lit * (1 - 0.55 * packed);
    heroLight.position.set(
      heroBulb.position.x,
      heroBulb.position.y + 0.78,
      heroBulb.position.z,
    );
    heroGlass.emissiveIntensity = 0.72 + 2 * lit;
    filamentMaterial.emissiveIntensity = 0.14 + 7 * lit;
    glow.position.copy(heroLight.position);
    glowMaterial.opacity = 0.72 * lit * (1 - 0.85 * packed);
    const glowSize = 3 + 0.22 * Math.sin(progress * 400);
    glow.scale.set(glowSize, glowSize, 1);

    const liftHeight = Math.max(heroBulb.position.x === 24 ? heroBulb.position.y - 2.3 : 0, 0.001);
    lifter.scale.y = liftHeight;
    lifter.position.y = 2.3 + liftHeight / 2;

    const beltTravel = numberAt(progress, [
      [0.315, 0],
      [0.455, 20],
      [0.7, 20],
      [0.755, 38],
    ]);
    beltStripes.forEach((stripe, index) => {
      stripe.position.x = 4 + (((index * 3 + beltTravel) % 39) + 39) % 39;
    });
    backgroundParts.forEach((part, index) => {
      part.position.x = 5 + (((index * 4.3 + progress * 30) % 34) + 34) % 34;
    });

    const vanX = numberAt(progress, [
      [0.885, 47.5],
      [0.98, 76],
    ]);
    if (progress > 0.878) {
      crate.position.set(vanX - 47.5 + 46.3, 0.62, 3.4);
    } else {
      const position = vectorAt(progress, cratePositions);
      crate.position.set(position[0], position[1], position[2]);
    }
    lidGroup.rotation.x = -1.85 * (1 - segment(progress, 0.8, 0.832));
    crateGlowMaterial.opacity = lit * 0.9 * segment(progress, 0.79, 0.81);
    if (progress > 0.795) {
      heroBulb.position.set(crate.position.x, crate.position.y + 0.12, crate.position.z);
    }

    van.position.x = vanX;
    const doorOpen =
      1.9 *
      Math.min(segment(progress, 0.83, 0.85), 1 - segment(progress, 0.878, 0.9));
    leftDoor.rotation.y = doorOpen;
    rightDoor.rotation.y = -doorOpen;
    wheels.forEach((wheel) => {
      wheel.rotation.z = -(vanX - 47.5) / 0.34;
    });
    headlightMaterial.emissiveIntensity = 3 * segment(progress, 0.885, 0.9);

    const factoryWake = segment(progress, 0.94, 0.985);
    windowMaterial.emissiveIntensity = 2.2 * factoryWake;
    factoryLight.intensity = 38 * factoryWake;

    updateInterface(progress);
  };

  let destroyed = false;
  let visible = true;
  let frame = 0;
  let progress = 0;
  let targetProgress = 0;
  let storyStart = 0;
  let storyRange = 1;

  const resize = () => {
    const bounds = stage.getBoundingClientRect();
    const width = Math.max(Math.round(bounds.width), 1);
    const height = Math.max(Math.round(bounds.height), 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 720 ? 1.5 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    storyStart = root.getBoundingClientRect().top + window.scrollY - parseFloat(getComputedStyle(stage).top);
    storyRange = Math.max(root.offsetHeight - height, 1);
    targetProgress = clamp((window.scrollY - storyStart) / storyRange, 0, 1);
    updateScene(progress);
    renderer.render(scene, camera);
  };

  const renderFrame = () => {
    frame = 0;
    if (destroyed || !visible || document.hidden) {
      return;
    }
    progress += (targetProgress - progress) * 0.12;
    if (Math.abs(targetProgress - progress) < 0.0004) {
      progress = targetProgress;
    }
    updateScene(progress);
    renderer.render(scene, camera);
    if (Math.abs(targetProgress - progress) >= 0.0004) {
      frame = window.requestAnimationFrame(renderFrame);
    }
  };

  const requestRender = () => {
    if (!frame && visible && !document.hidden) {
      frame = window.requestAnimationFrame(renderFrame);
    }
  };

  const onScroll = () => {
    targetProgress = clamp((window.scrollY - storyStart) / storyRange, 0, 1);
    requestRender();
  };

  const onVisibilityChange = () => {
    if (!document.hidden) {
      requestRender();
    }
  };

  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) {
        onScroll();
      } else if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    { rootMargin: "25% 0px" },
  );
  const resizeObserver = new ResizeObserver(resize);
  intersectionObserver.observe(root);
  resizeObserver.observe(stage);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  root.dataset.storyState = "animated";
  resize();
  onScroll();

  return {
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const objectMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          objectMaterials.forEach((objectMaterial) => objectMaterial.dispose());
        }
      });
      glowTexture.dispose();
      glowMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      root.dataset.storyState = "static";
    },
  };
}
