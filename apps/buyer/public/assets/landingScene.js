import * as THREE from "three";
const storyWindows = [
    { chapter: "intro", start: 0, end: 0.085 },
    { chapter: "find", start: 0.1, end: 0.34 },
    { chapter: "connect", start: 0.43, end: 0.68 },
    { chapter: "deploy", start: 0.72, end: 0.92 },
    { chapter: "outcome", start: 0.935, end: 1 },
];
const chapterTargets = {
    find: 0.145,
    connect: 0.505,
    deploy: 0.765,
};
const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const smooth = (value) => value * value * (3 - 2 * value);
const segment = (progress, start, end) => smooth(clamp((progress - start) / (end - start)));
function numberAt(progress, keyframes) {
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
function linearAt(progress, keyframes) {
    if (progress <= keyframes[0][0]) {
        return keyframes[0][1];
    }
    for (let index = 0; index < keyframes.length - 1; index += 1) {
        const current = keyframes[index];
        const next = keyframes[index + 1];
        if (progress <= next[0]) {
            const amount = (progress - current[0]) / (next[0] - current[0]);
            return current[1] + (next[1] - current[1]) * amount;
        }
    }
    return keyframes[keyframes.length - 1][1];
}
function vectorAt(progress, keyframes) {
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
function panelOpacity(progress, start, end) {
    const fadeIn = start === 0 ? 1 : segment(progress, start, start + 0.028);
    const fadeOut = end === 1 ? 1 : 1 - segment(progress, end - 0.028, end);
    return Math.min(fadeIn, fadeOut);
}
function requiredElement(root, selector) {
    const element = root.querySelector(selector);
    if (!element) {
        throw new Error(`Lumen story is missing ${selector}`);
    }
    return element;
}
function seededRandom(seed = 1827) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}
export function createLumenStory(root) {
    const stage = requiredElement(root, "[data-story-stage]");
    const canvasHost = requiredElement(root, "[data-story-canvas]");
    const progressLabel = requiredElement(root, "[data-story-progress]");
    const railFill = requiredElement(root, "[data-story-rail-fill]");
    const hint = requiredElement(root, "[data-story-hint]");
    const doors = requiredElement(root, "[data-factory-doors]");
    const panels = new Map(Array.from(root.querySelectorAll("[data-story-panel]")).map((panel) => [
        panel.dataset.storyPanel,
        panel,
    ]));
    const railButtons = new Map(Array.from(root.querySelectorAll("[data-story-jump]")).map((button) => [
        button.dataset.storyJump,
        button,
    ]));
    const renderer = new THREE.WebGLRenderer({
        antialias: window.innerWidth >= 720,
        powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 720 ? 1.35 : 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    canvasHost.replaceChildren(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1828);
    scene.fog = new THREE.Fog(0x16233a, 30, 140);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    const random = seededRandom();
    const material = (color, options = {}) => new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        metalness: 0.05,
        roughness: 0.92,
        ...options,
    });
    const materials = {
        platform: material(0x223042),
        road: material(0x1a2433),
        machine: material(0x41506a),
        machineDark: material(0x2b374a),
        dark: material(0x18202e),
        belt: material(0x202b3c),
        metal: material(0x8296b2, { metalness: 0.4, roughness: 0.5 }),
        greyGlass: material(0x6a7d9a, { flatShading: false, roughness: 0.35 }),
        base: material(0x8a94a6, { metalness: 0.5, roughness: 0.45 }),
        heroBase: material(0xc23434, { metalness: 0.35, roughness: 0.5 }),
        lightBlue: material(0x9db8dc, { roughness: 0.6 }),
        red: material(0xd63c3c, { roughness: 0.6 }),
    };
    const box = (width, height, depth, boxMaterial, x, y, z, parent = scene, noShadow = false) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), boxMaterial);
        mesh.position.set(x, y, z);
        if (!noShadow) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        }
        parent.add(mesh);
        return mesh;
    };
    const cylinder = (radiusTop, radiusBottom, height, cylinderMaterial, x, y, z, parent = scene, segments = 10) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), cylinderMaterial);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    };
    scene.add(new THREE.HemisphereLight(0x33496a, 0x101826, 1.15));
    const rimLight = new THREE.DirectionalLight(0x8fb2e8, 1.4);
    rimLight.position.set(-14, 16, -30);
    scene.add(rimLight);
    const keyLight = new THREE.DirectionalLight(0xaac4e8, 2.8);
    keyLight.position.set(18, 32, 20);
    keyLight.castShadow = true;
    const shadowSize = window.innerWidth < 720 ? 1024 : 2048;
    keyLight.shadow.mapSize.set(shadowSize, shadowSize);
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.03;
    Object.assign(keyLight.shadow.camera, {
        left: -45,
        right: 45,
        top: 32,
        bottom: -32,
        near: 2,
        far: 110,
    });
    keyLight.target.position.set(24, 0, 0);
    scene.add(keyLight, keyLight.target);
    const floorCanvas = document.createElement("canvas");
    floorCanvas.width = 512;
    floorCanvas.height = 128;
    const floorContext = floorCanvas.getContext("2d");
    if (!floorContext) {
        throw new Error("Canvas 2D is unavailable");
    }
    floorContext.fillStyle = "#223042";
    floorContext.fillRect(0, 0, 512, 128);
    for (let index = 0; index < 90; index += 1) {
        floorContext.fillStyle = `rgba(10,16,26,${(0.03 + random() * 0.07).toFixed(3)})`;
        floorContext.beginPath();
        floorContext.arc(random() * 512, random() * 128, 6 + random() * 28, 0, Math.PI * 2);
        floorContext.fill();
    }
    floorContext.strokeStyle = "rgba(12,18,28,0.75)";
    floorContext.lineWidth = 2;
    for (let x = 0; x <= 512; x += 44) {
        floorContext.beginPath();
        floorContext.moveTo(x, 0);
        floorContext.lineTo(x, 128);
        floorContext.stroke();
    }
    for (let y = 0; y <= 128; y += 33) {
        floorContext.beginPath();
        floorContext.moveTo(0, y);
        floorContext.lineTo(512, y);
        floorContext.stroke();
    }
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    const floorMaterial = new THREE.MeshStandardMaterial({
        map: floorTexture,
        roughness: 0.95,
    });
    const slab = box(58, 1.2, 15, floorMaterial, 23, -0.6, 0);
    slab.receiveShadow = true;
    box(25, 0.8, 3.6, materials.road, 64.5, -0.4, 3.4);
    box(14, 1.2, 12, materials.platform, 84, -0.6, 3);
    box(58, 0.05, 0.1, materials.red, 23, 0.06, 7.45, scene, true);
    const basePoints = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.125, 0)];
    for (let index = 0; index < 6; index += 1) {
        basePoints.push(new THREE.Vector2(index % 2 ? 0.112 : 0.145, 0.05 + index * 0.047));
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
    const redGlass = new THREE.MeshStandardMaterial({
        color: 0xd63c3c,
        emissive: new THREE.Color(0x4a0a0a),
        emissiveIntensity: 0.7,
        opacity: 0.9,
        roughness: 0.3,
        transparent: true,
    });
    const makeBulb = (glassMaterial, baseMaterial = materials.base) => {
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
            const bulb = makeBulb(materials.greyGlass);
            bulb.position.set(x, 0.8, z);
            bulb.rotation.y = column * 1.3 + row * 0.7;
            scene.add(bulb);
        }
    }
    const heroBulb = makeBulb(redGlass, materials.heroBase);
    heroBulb.position.set(sourceX, 0.8, sourceZ);
    scene.add(heroBulb);
    const filamentMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a1c10,
        emissive: 0xffc070,
        emissiveIntensity: 0.15,
    });
    cylinder(0.012, 0.012, 0.26, filamentMaterial, -0.05, 0.47, 0, heroBulb, 5);
    cylinder(0.012, 0.012, 0.26, filamentMaterial, 0.05, 0.47, 0, heroBulb, 5);
    const filament = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 5, 14), filamentMaterial);
    filament.rotation.x = Math.PI / 2;
    filament.position.y = 0.62;
    heroBulb.add(filament);
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const glowContext = glowCanvas.getContext("2d");
    if (!glowContext) {
        throw new Error("Canvas 2D is unavailable");
    }
    const glowGradient = glowContext.createRadialGradient(64, 64, 2, 64, 64, 62);
    glowGradient.addColorStop(0, "rgba(255,214,150,0.9)");
    glowGradient.addColorStop(0.35, "rgba(255,180,110,0.32)");
    glowGradient.addColorStop(1, "rgba(255,170,100,0)");
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
    const bulbGlow = new THREE.Sprite(glowMaterial);
    bulbGlow.scale.set(3, 3, 1);
    scene.add(bulbGlow);
    const scanMaterial = new THREE.MeshBasicMaterial({
        color: 0xff4a3c,
        opacity: 0,
        transparent: true,
    });
    const scanPlane = box(3, 0.03, 0.5, scanMaterial, 0, 1.62, 0, scene, true);
    const reticleMaterial = new THREE.MeshBasicMaterial({
        color: 0xff4a3c,
        opacity: 0,
        transparent: true,
    });
    const reticle = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 6, 24), reticleMaterial);
    reticle.rotation.x = Math.PI / 2;
    reticle.position.set(sourceX, 2, sourceZ);
    scene.add(reticle);
    const upperArmLength = 2.4;
    const lowerArmLength = 2.2;
    const armPivot = new THREE.Vector3(2.4, 1.2, 2.4);
    cylinder(0.55, 0.7, 0.25, materials.machineDark, armPivot.x, 0.12, armPivot.z, scene, 12);
    cylinder(0.4, 0.48, 1.1, materials.machine, armPivot.x, 0.68, armPivot.z, scene, 12);
    const armYaw = new THREE.Group();
    armYaw.position.copy(armPivot);
    scene.add(armYaw);
    box(0.7, 0.55, 0.55, materials.machine, 0, 0.1, 0, armYaw);
    const upperArm = new THREE.Group();
    upperArm.position.y = 0.25;
    armYaw.add(upperArm);
    box(upperArmLength, 0.3, 0.3, materials.machine, upperArmLength / 2, 0, 0, upperArm);
    const elbow = new THREE.Group();
    elbow.position.x = upperArmLength;
    upperArm.add(elbow);
    const elbowJoint = cylinder(0.22, 0.22, 0.5, materials.machineDark, 0, 0, 0, elbow, 10);
    elbowJoint.rotation.x = Math.PI / 2;
    box(lowerArmLength, 0.24, 0.24, materials.machine, lowerArmLength / 2, 0, 0, elbow);
    const armTip = new THREE.Group();
    armTip.position.x = lowerArmLength;
    elbow.add(armTip);
    const gripper = new THREE.Group();
    armTip.add(gripper);
    cylinder(0.09, 0.1, 0.24, materials.machineDark, 0, 0.04, 0, gripper, 8);
    box(0.34, 0.16, 1.42, materials.machineDark, 0, -0.12, 0, gripper);
    box(0.2, 0.1, 0.2, materials.machine, 0, -0.25, 0, gripper);
    const sensorMaterial = new THREE.MeshStandardMaterial({
        color: 0x330808,
        emissive: 0xd63c3c,
        emissiveIntensity: 0,
    });
    box(0.15, 0.1, 0.15, sensorMaterial, 0.28, -0.22, 0, gripper, true);
    const fingerLeft = box(0.07, 0.55, 0.12, materials.metal, 0, -0.48, 0.45, gripper);
    const fingerRight = box(0.07, 0.55, 0.12, materials.metal, 0, -0.48, -0.45, gripper);
    box(0.09, 0.16, 0.05, materials.dark, 0, -0.22, -0.085, fingerLeft, true);
    box(0.09, 0.16, 0.05, materials.dark, 0, -0.22, 0.085, fingerRight, true);
    const armTipWorld = new THREE.Vector3();
    const solveArm = (target) => {
        const dx = target[0] - armPivot.x;
        const dz = target[2] - armPivot.z;
        const radius = Math.hypot(dx, dz);
        const height = target[1] - armPivot.y - 0.25;
        const distance = clamp(Math.hypot(radius, height), 0.6, upperArmLength + lowerArmLength - 0.05);
        const shoulderAngle = Math.acos(clamp((upperArmLength ** 2 + distance ** 2 - lowerArmLength ** 2) /
            (2 * upperArmLength * distance), -1, 1));
        const elbowAngle = Math.acos(clamp((upperArmLength ** 2 + lowerArmLength ** 2 - distance ** 2) /
            (2 * upperArmLength * lowerArmLength), -1, 1));
        armYaw.rotation.y = -Math.atan2(dz, dx);
        upperArm.rotation.z = Math.atan2(height, radius) + shoulderAngle;
        elbow.rotation.z = -(Math.PI - elbowAngle);
        gripper.rotation.z = -(upperArm.rotation.z + elbow.rotation.z);
        armYaw.updateMatrixWorld(true);
        armTip.getWorldPosition(armTipWorld);
    };
    const armKeyframes = [
        [0.05, [3.6, 3.3, 0.9]],
        [0.115, [0, 3.8, 0]],
        [0.155, [sourceX, 3.1, sourceZ]],
        [0.195, [sourceX, 2.6, sourceZ]],
        [0.218, [sourceX, 2.15, sourceZ]],
        [0.255, [sourceX, 3.6, sourceZ]],
        [0.285, [4, 3.85, 0]],
        [0.305, [4, 3.65, 0]],
        [0.335, [3.9, 3.9, 0.6]],
        [0.39, [3.6, 3.3, 0.9]],
    ];
    box(39, 0.5, 1.4, materials.belt, 23, 2.05, 0);
    for (let x = 5; x <= 41; x += 4.5) {
        box(0.25, 1.8, 0.25, materials.dark, x, 0.9, 0.5);
        box(0.25, 1.8, 0.25, materials.dark, x, 0.9, -0.5);
    }
    box(39, 0.1, 0.08, materials.red, 23, 2.36, 0.72);
    box(39, 0.1, 0.08, materials.machineDark, 23, 2.36, -0.72);
    const beltStripes = [];
    for (let index = 0; index < 13; index += 1) {
        beltStripes.push(box(0.2, 0.03, 1.3, materials.dark, 4, 2.31, 0, scene, true));
    }
    box(0.35, 6, 0.35, materials.machine, 24, 3, 1.6);
    box(0.35, 6, 0.35, materials.machine, 24, 3, -1.6);
    box(0.3, 0.3, 3.6, materials.machine, 24, 6, 0);
    cylinder(0.05, 0.05, 1, materials.dark, 24, 5.35, 0, scene, 6);
    cylinder(0.26, 0.3, 0.45, materials.metal, 24, 4.6, 0, scene, 10);
    const lifter = cylinder(0.28, 0.34, 1, materials.machineDark, 24, 2.3, 0, scene, 10);
    const heroLight = new THREE.PointLight(0xffd9a0, 0, 15, 2);
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
    const rollerA = new THREE.Group();
    rollerA.position.set(43, 1.2, 1.9);
    rollerA.rotation.x = 0.185;
    scene.add(rollerA);
    box(0.08, 0.1, 2.7, materials.machineDark, -0.5, 0, 0, rollerA);
    box(0.08, 0.1, 2.7, materials.machineDark, 0.5, 0, 0, rollerA);
    for (let z = -1.2; z <= 1.2; z += 0.34) {
        const roller = cylinder(0.05, 0.05, 0.94, materials.metal, 0, 0.02, z, rollerA, 8);
        roller.rotation.z = Math.PI / 2;
    }
    const rollerB = new THREE.Group();
    rollerB.position.set(44.5, 0.82, 3.4);
    rollerB.rotation.z = -0.15;
    scene.add(rollerB);
    box(2.5, 0.1, 0.08, materials.machineDark, 0, 0, -0.5, rollerB);
    box(2.5, 0.1, 0.08, materials.machineDark, 0, 0, 0.5, rollerB);
    for (let x = -1.1; x <= 1.1; x += 0.31) {
        const roller = cylinder(0.05, 0.05, 0.94, materials.metal, x, 0.02, 0, rollerB, 8);
        roller.rotation.x = Math.PI / 2;
    }
    box(0.14, 1, 0.14, materials.dark, 43, 0.5, 2.9);
    box(0.14, 0.7, 0.14, materials.dark, 44.2, 0.35, 3);
    box(0.14, 0.6, 0.14, materials.dark, 45.3, 0.3, 3.8);
    const crate = new THREE.Group();
    scene.add(crate);
    const woodMaterial = material(0x4a4436, { roughness: 0.95 });
    const crateMaterial = material(0xb93532, { roughness: 0.7 });
    box(1, 0.1, 1, crateMaterial, 0, 0.05, 0, crate);
    box(1, 0.7, 0.08, crateMaterial, 0, 0.45, -0.46, crate);
    box(1, 0.7, 0.08, crateMaterial, 0, 0.45, 0.46, crate);
    box(0.08, 0.7, 1, crateMaterial, -0.46, 0.45, 0, crate);
    box(0.08, 0.7, 1, crateMaterial, 0.46, 0.45, 0, crate);
    for (const [x, z] of [
        [0.47, 0.47],
        [0.47, -0.47],
        [-0.47, 0.47],
        [-0.47, -0.47],
    ]) {
        box(0.09, 0.78, 0.09, materials.dark, x, 0.42, z, crate, true);
    }
    const seamMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd9a0,
        opacity: 0,
        transparent: true,
    });
    box(0.9, 0.04, 0.9, seamMaterial, 0, 0.82, 0, crate, true);
    const lid = new THREE.Group();
    lid.position.set(0, 0.82, -0.5);
    crate.add(lid);
    box(1.08, 0.09, 1.08, crateMaterial, 0, 0.045, 0.5, lid);
    const van = new THREE.Group();
    van.position.set(47.5, 0, 3.4);
    scene.add(van);
    box(3, 0.12, 1.5, materials.machine, -0.2, 0.61, 0, van);
    box(3, 0.12, 1.5, materials.machine, -0.2, 1.79, 0, van);
    box(3, 1.06, 0.1, materials.machine, -0.2, 1.2, 0.7, van);
    box(3, 1.06, 0.1, materials.machine, -0.2, 1.2, -0.7, van);
    box(0.1, 1.06, 1.5, materials.machine, 1.25, 1.2, 0, van);
    box(0.95, 0.95, 1.4, materials.machineDark, 1.75, 1.02, 0, van);
    box(0.9, 0.4, 1.3, materials.dark, 1.78, 1.62, 0, van, true);
    const headlightMaterial = new THREE.MeshStandardMaterial({
        color: 0x222a36,
        emissive: 0xffe8c0,
        emissiveIntensity: 0,
    });
    box(0.08, 0.14, 0.22, headlightMaterial, 2.24, 0.85, 0.45, van, true);
    box(0.08, 0.14, 0.22, headlightMaterial, 2.24, 0.85, -0.45, van, true);
    box(0.1, 0.1, 1.3, materials.red, -1.72, 0.48, 0, van, true);
    const tailLightMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a0808,
        emissive: 0xff2a22,
        emissiveIntensity: 0.5,
    });
    box(0.06, 0.16, 0.2, tailLightMaterial, -1.78, 1, 0.6, van, true);
    box(0.06, 0.16, 0.2, tailLightMaterial, -1.78, 1, -0.6, van, true);
    const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10);
    wheelGeometry.rotateX(Math.PI / 2);
    const wheels = [];
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
    const doorLeft = new THREE.Group();
    doorLeft.position.set(-1.72, 1.2, 0.75);
    van.add(doorLeft);
    box(0.08, 1.24, 0.72, materials.machineDark, 0, 0, -0.36, doorLeft);
    const doorRight = new THREE.Group();
    doorRight.position.set(-1.72, 1.2, -0.75);
    van.add(doorRight);
    box(0.08, 1.24, 0.72, materials.machineDark, 0, 0, 0.36, doorRight);
    box(7, 6, 6, materials.machine, 84, 3, 3);
    box(4, 3.2, 5, materials.machineDark, 79.5, 1.6, 5.5);
    box(7.4, 0.35, 6.4, materials.machineDark, 84, 6.15, 3);
    box(4.4, 0.28, 5.4, materials.dark, 79.5, 3.3, 5.5);
    cylinder(0.5, 0.6, 3.2, materials.machineDark, 85.5, 7.4, 1.8, scene, 10);
    cylinder(0.32, 0.4, 2.2, materials.machineDark, 83.6, 6.9, 4.2, scene, 10);
    box(2.6, 0.55, 0.14, materials.red, 80.42, 5.3, 3, scene, true);
    const coolWindowMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a2434,
        emissive: 0x9db4d8,
        emissiveIntensity: 0.35,
        flatShading: true,
    });
    for (let row = 0; row < 2; row += 1) {
        box(0.1, 0.7, 0.55, coolWindowMaterial, 80.47, 2.2 + row * 1.6, 1.2, scene, true);
        box(0.1, 0.7, 0.55, coolWindowMaterial, 80.47, 2.2 + row * 1.6, 5, scene, true);
    }
    for (let column = 0; column < 3; column += 1) {
        box(0.95, 0.75, 0.1, coolWindowMaterial, 82.4 + column * 1.5, 4.5, 0.02, scene, true);
    }
    const destinationWindowMaterial = new THREE.MeshStandardMaterial({
        color: 0x131a26,
        emissive: 0xffc98a,
        emissiveIntensity: 0,
        flatShading: true,
    });
    box(0.12, 1.5, 1.2, destinationWindowMaterial, 80.45, 3.4, 3.2, scene, true);
    box(0.12, 2, 1.4, materials.dark, 80.45, 1.3, 4.4, scene, true);
    box(1.4, 0.5, 1.2, materials.machineDark, 81.3, 0.25, 3.4);
    box(0.9, 0.9, 0.9, woodMaterial, 81.7, 0.45, 5.4);
    box(0.65, 0.65, 0.65, woodMaterial, 80.9, 0.33, 6.2);
    const destinationLight = new THREE.PointLight(0xffc98a, 0, 22, 2);
    destinationLight.position.set(79.2, 3.4, 3.2);
    scene.add(destinationLight);
    box(1.2, 0.18, 1, materials.dark, 12, 0.09, -2.6);
    box(1.1, 0.5, 0.9, materials.machineDark, 12, 0.5, -2.6);
    box(1.2, 0.18, 1, materials.dark, 12, 0.85, -2.6);
    cylinder(0.35, 0.35, 0.9, materials.machineDark, 30, 0.45, 2.4, scene, 10);
    cylinder(0.35, 0.35, 0.9, materials.machine, 30.8, 0.45, 2.1, scene, 10);
    cylinder(0.35, 0.35, 0.9, materials.machineDark, 30.4, 1.35, 2.25, scene, 10);
    const poolCanvas = document.createElement("canvas");
    poolCanvas.width = 128;
    poolCanvas.height = 128;
    const poolContext = poolCanvas.getContext("2d");
    if (!poolContext) {
        throw new Error("Canvas 2D is unavailable");
    }
    const poolGradient = poolContext.createRadialGradient(64, 64, 4, 64, 64, 62);
    poolGradient.addColorStop(0, "rgba(168,200,242,0.55)");
    poolGradient.addColorStop(1, "rgba(168,200,242,0)");
    poolContext.fillStyle = poolGradient;
    poolContext.fillRect(0, 0, 128, 128);
    const poolTexture = new THREE.CanvasTexture(poolCanvas);
    const addLightPool = (x, z, size) => {
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            map: poolTexture,
            opacity: 0.5,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -2,
            transparent: true,
        }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(x, 0.08, z);
        scene.add(pool);
    };
    for (const x of [2, 14, 28, 40]) {
        box(0.14, 3.4, 0.14, materials.dark, x, 1.7, -3.1);
        box(0.5, 0.12, 0.3, materials.machineDark, x, 3.42, -2.95);
        box(0.3, 0.06, 0.2, new THREE.MeshBasicMaterial({ color: 0xb8cce8 }), x, 3.34, -2.95, scene, true);
        addLightPool(x, -2.2, 5.5);
    }
    for (const x of [10, 19, 37]) {
        box(0.22, 5.2, 0.22, materials.machine, x, 2.6, 2.9);
        box(0.22, 5.2, 0.22, materials.machine, x, 2.6, -2.9);
        box(0.26, 0.3, 6.1, materials.machineDark, x, 5.25, 0);
        box(0.14, 0.05, 3.4, new THREE.MeshBasicMaterial({ color: 0xb8cce8 }), x, 5.07, 0, scene, true);
        addLightPool(x, 0, 7);
    }
    const hazardCanvas = document.createElement("canvas");
    hazardCanvas.width = 64;
    hazardCanvas.height = 64;
    const hazardContext = hazardCanvas.getContext("2d");
    if (!hazardContext) {
        throw new Error("Canvas 2D is unavailable");
    }
    hazardContext.fillStyle = "#18202e";
    hazardContext.fillRect(0, 0, 64, 64);
    hazardContext.strokeStyle = "#a83430";
    hazardContext.lineWidth = 11;
    for (let offset = -64; offset < 128; offset += 26) {
        hazardContext.beginPath();
        hazardContext.moveTo(offset, 64);
        hazardContext.lineTo(offset + 64, 0);
        hazardContext.stroke();
    }
    const hazardTexture = new THREE.CanvasTexture(hazardCanvas);
    hazardTexture.wrapS = THREE.RepeatWrapping;
    hazardTexture.wrapT = THREE.RepeatWrapping;
    hazardTexture.repeat.set(8, 1);
    const hazardMaterial = new THREE.MeshStandardMaterial({
        map: hazardTexture,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
        roughness: 0.9,
    });
    box(4.5, 0.06, 0.35, hazardMaterial, 0, 0.07, 6.9, scene, true);
    box(4.5, 0.06, 0.35, hazardMaterial, 24, 0.07, 6.9, scene, true);
    box(4.5, 0.06, 0.35, hazardMaterial, 43, 0.07, 6.9, scene, true);
    for (const [height, z] of [
        [1.25, -3.35],
        [1.65, -3.55],
    ]) {
        const pipe = cylinder(0.14, 0.14, 44, materials.machineDark, 24, height, z, scene, 8);
        pipe.rotation.z = Math.PI / 2;
        for (let x = 4; x <= 44; x += 8) {
            box(0.12, height + 0.1, 0.12, materials.dark, x, height / 2, z);
        }
    }
    box(36, 0.35, 1.1, materials.belt, 22, 1.5, -5.6);
    for (let x = 6; x <= 38; x += 5) {
        box(0.2, 1.35, 0.2, materials.dark, x, 0.67, -5.2);
        box(0.2, 1.35, 0.2, materials.dark, x, 0.67, -6);
    }
    const backgroundParts = [];
    for (let index = 0; index < 8; index += 1) {
        backgroundParts.push(index % 2
            ? box(0.5, 0.4, 0.5, materials.machine, 0, 1.9, -5.6)
            : cylinder(0.24, 0.24, 0.45, materials.metal, 0, 1.9, -5.6, scene, 8));
    }
    box(24, 0.12, 1, materials.machineDark, 23, 3.8, -4.6);
    for (let x = 12; x <= 34; x += 5.5) {
        box(0.22, 3.8, 0.22, materials.dark, x, 1.9, -4.6);
    }
    box(24, 0.05, 0.05, materials.dark, 23, 4.6, -4.15);
    box(24, 0.05, 0.05, materials.dark, 23, 4.6, -5.05);
    for (let x = 11.5; x <= 34.5; x += 2.3) {
        box(0.04, 0.8, 0.04, materials.dark, x, 4.2, -4.15);
        box(0.04, 0.8, 0.04, materials.dark, x, 4.2, -5.05);
    }
    const signTexture = (text) => {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 80;
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Canvas 2D is unavailable");
        }
        context.fillStyle = "#141c2a";
        context.fillRect(0, 0, 128, 80);
        context.strokeStyle = "#2c3a52";
        context.lineWidth = 3;
        context.strokeRect(3, 3, 122, 74);
        context.fillStyle = "#a83430";
        context.fillRect(10, 12, 22, 9);
        context.fillStyle = "#b8cce8";
        context.font = "bold 26px monospace";
        context.fillText(text, 10, 58);
        return new THREE.CanvasTexture(canvas);
    };
    const addSign = (text, x, y, z) => {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.94), new THREE.MeshBasicMaterial({ map: signTexture(text) }));
        sign.position.set(x, y, z);
        scene.add(sign);
        box(0.1, y, 0.1, materials.dark, x, y / 2, z - 0.08);
    };
    addSign("BIN 01", 0, 2.7, -2.95);
    addSign("FIT 02", 27.2, 2.7, -2.95);
    addSign("DOCK 03", 41, 2.7, -2.95);
    const pallet = (x, z, rotationY = 0) => {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        group.rotation.y = rotationY;
        scene.add(group);
        box(1.4, 0.08, 1.3, woodMaterial, 0, 0.25, 0, group);
        for (const offset of [-0.6, 0, 0.6]) {
            box(0.14, 0.18, 1.3, woodMaterial, offset, 0.09, 0, group);
        }
        return group;
    };
    let palletGroup = pallet(7, 2.6, 0.3);
    box(0.9, 0.7, 0.8, materials.machineDark, -0.15, 0.65, 0, palletGroup);
    box(0.5, 0.45, 0.5, materials.machine, 0.4, 0.52, 0.25, palletGroup);
    palletGroup = pallet(20.5, -2.4, -0.2);
    box(1.1, 0.5, 0.9, materials.machine, 0, 0.55, 0, palletGroup);
    box(0.7, 0.4, 0.6, materials.machineDark, 0.1, 1, 0.05, palletGroup);
    palletGroup = pallet(38.5, 2.7, 0.5);
    box(0.8, 0.6, 0.7, materials.machineDark, 0, 0.6, 0, palletGroup);
    palletGroup = pallet(41.2, 3.1, -0.4);
    box(1, 0.55, 0.85, materials.machine, 0, 0.57, 0, palletGroup);
    box(3.2, 0.06, 0.35, hazardMaterial, 44.3, 0.07, 1.1, scene, true);
    box(0.12, 1.9, 0.12, materials.dark, 45.6, 0.95, 0.9);
    cylinder(0.14, 0.16, 0.16, materials.machineDark, 45.6, 1.95, 0.9, scene, 8);
    const beacon = new THREE.Group();
    beacon.position.set(45.6, 2.1, 0.9);
    scene.add(beacon);
    const beaconMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a0d0d,
        emissive: 0xd63c3c,
        emissiveIntensity: 1.6,
    });
    cylinder(0.1, 0.12, 0.2, beaconMaterial, 0, 0, 0, beacon, 8);
    box(0.55, 0.05, 0.05, beaconMaterial, 0.22, 0, 0, beacon, true);
    box(0.8, 12, 9.9, materials.machineDark, 52, 6, -4.05);
    box(0.8, 12, 4.6, materials.machineDark, 52, 6, 8.2);
    box(0.8, 5, 5, materials.machineDark, 52, 9.5, 3.4);
    box(0.9, 0.9, 5.2, materials.machine, 52, 7.15, 3.4);
    box(0.9, 7.2, 0.25, materials.red, 52, 3.5, 0.9, scene, true);
    box(0.9, 7.2, 0.25, materials.red, 52, 3.5, 5.9, scene, true);
    box(0.95, 0.3, 5.2, materials.red, 52, 6.85, 3.4, scene, true);
    box(0.86, 0.06, 0.4, hazardMaterial, 51.55, 0.07, 0.9, scene, true);
    box(0.86, 0.06, 0.4, hazardMaterial, 51.55, 0.07, 5.9, scene, true);
    for (let z = -8; z <= 9.5; z += 2.5) {
        if (z < 0.4 || z > 6.4) {
            box(0.85, 11.6, 0.06, materials.dark, 52, 6, z, scene, true);
        }
    }
    const starPositions = new Float32Array(300 * 3);
    for (let index = 0; index < 300; index += 1) {
        starPositions[index * 3] = 55 + random() * 90;
        starPositions[index * 3 + 1] = 3 + random() * 55;
        starPositions[index * 3 + 2] = -70 + random() * 140;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xcfe0ff, fog: false, size: 0.22 })));
    const hillMaterial = material(0x121c2c);
    for (const [x, z, radius, height] of [
        [75, -35, 25, 6],
        [100, 35, 38, 9],
        [130, -25, 45, 11],
    ]) {
        const hill = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5), hillMaterial);
        hill.position.set(x, height / 2 - 0.5, z);
        scene.add(hill);
    }
    const roadBend = box(18, 0.7, 3, materials.road, 68, -0.45, 12);
    roadBend.rotation.y = 0.6;
    const moon = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xe8f1fc, fog: false }));
    moon.position.set(125, 42, -30);
    moon.lookAt(28, 4, 8);
    scene.add(moon);
    const moonLight = new THREE.DirectionalLight(0xbdd4f5, 0.9);
    moonLight.position.set(85, 18, 12);
    moonLight.target.position.set(48, 0, 3.4);
    scene.add(moonLight, moonLight.target);
    const addRail = (start, end) => {
        const length = end - start;
        const center = (start + end) / 2;
        box(length, 0.06, 0.06, materials.red, center, 1.05, 7, scene, true);
        box(length, 0.05, 0.05, materials.red, center, 0.6, 7, scene, true);
        for (let x = start; x <= end; x += 4.4) {
            box(0.08, 1.1, 0.08, materials.machineDark, x, 0.55, 7);
        }
    };
    addRail(3, 20);
    addRail(26, 40);
    const destinationGlowMaterial = new THREE.SpriteMaterial({
        blending: THREE.AdditiveBlending,
        color: 0xffc98a,
        depthWrite: false,
        map: glowTexture,
        opacity: 0,
        transparent: true,
    });
    const destinationGlow = new THREE.Sprite(destinationGlowMaterial);
    destinationGlow.scale.set(4.5, 4.5, 1);
    destinationGlow.position.set(80.2, 3.4, 3.2);
    scene.add(destinationGlow);
    const cameraPositions = [
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
    const cameraTargets = [
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
    const cameraCurve = new THREE.CatmullRomCurve3(cameraPositions.map(([, value]) => new THREE.Vector3(...value)), false, "centripetal");
    const targetCurve = new THREE.CatmullRomCurve3(cameraTargets.map(([, value]) => new THREE.Vector3(...value)), false, "centripetal");
    const cameraTiming = cameraPositions.map(([progress], index) => [progress, index / (cameraPositions.length - 1)]);
    const targetTiming = cameraTargets.map(([progress], index) => [progress, index / (cameraTargets.length - 1)]);
    const cameraTarget = new THREE.Vector3();
    solveArm(vectorAt(0.305, armKeyframes));
    const bulbKeyframes = [
        [0.305, [armTipWorld.x, armTipWorld.y - 1.35, armTipWorld.z]],
        [0.322, [4.2, 2.3, 0]],
        [0.455, [24, 2.3, 0]],
        [0.5, [24, 2.3, 0]],
        [0.53, [24, 3.3, 0]],
        [0.555, [24, 4.3, 0]],
        [0.578, [24, 4.75, 0]],
        [0.645, [24, 4.75, 0]],
        [0.685, [24, 2.3, 0]],
        [0.7, [24, 2.3, 0]],
        [0.755, [42, 2.3, 0]],
        [0.772, [43, 2.65, 0]],
        [0.795, [43, 1.62, 0]],
    ];
    const crateKeyframes = [
        [0, [43, 1.51, 0]],
        [0.838, [43, 1.51, 0]],
        [0.846, [43, 1.46, 0.95]],
        [0.858, [43, 1.06, 3.35]],
        [0.87, [44.4, 0.88, 3.4]],
        [0.882, [46.35, 0.67, 3.4]],
    ];
    const heroWorld = new THREE.Vector3();
    const heroProjected = new THREE.Vector3();
    let viewportWidth = 1;
    let viewportHeight = 1;
    let storyStart = 0;
    let storyRange = 1;
    let targetProgress = 0;
    let renderedProgress = 0;
    let animationFrame = 0;
    let destroyed = false;
    const currentRailChapter = (progress) => {
        if (progress < 0.405) {
            return "find";
        }
        if (progress < 0.7) {
            return "connect";
        }
        return "deploy";
    };
    const updatePanels = (progress) => {
        for (const { chapter, start, end } of storyWindows) {
            const panel = panels.get(chapter);
            if (!panel) {
                continue;
            }
            const opacity = panelOpacity(progress, start, end);
            const entering = start === 0 ? 1 : segment(progress, start, start + 0.04);
            const leaving = end === 1 ? 0 : segment(progress, end - 0.04, end);
            const offset = (1 - entering) * 36 - leaving * 36;
            panel.style.opacity = opacity.toFixed(4);
            panel.style.transform = `translateY(calc(-50% + ${offset.toFixed(2)}px))`;
            panel.setAttribute("aria-hidden", opacity > 0.35 ? "false" : "true");
        }
        const activeChapter = currentRailChapter(progress);
        const chapterOrder = ["find", "connect", "deploy"];
        const activeIndex = chapterOrder.indexOf(activeChapter);
        chapterOrder.forEach((chapter, index) => {
            const button = railButtons.get(chapter);
            if (!button) {
                return;
            }
            button.classList.toggle("is-active", index === activeIndex);
            button.classList.toggle("is-complete", index < activeIndex);
            if (index === activeIndex) {
                button.setAttribute("aria-current", "step");
            }
            else {
                button.removeAttribute("aria-current");
            }
        });
        railFill.style.transform = `scaleY(${progress.toFixed(4)})`;
        progressLabel.textContent = `${String(Math.round(progress * 100)).padStart(3, "0")}%`;
        hint.style.opacity = String(1 - segment(progress, 0.005, 0.035));
        root.dataset.storyChapter = activeChapter;
    };
    const composeProtagonist = (progress) => {
        if (progress < 0.055) {
            return;
        }
        heroBulb.updateWorldMatrix(true, false);
        heroBulb.getWorldPosition(heroWorld);
        heroWorld.y += 0.56;
        heroProjected.copy(heroWorld).project(camera);
        const isNarrow = viewportWidth < 680;
        const desiredX = isNarrow ? 0.04 : 0.34;
        const desiredY = isNarrow ? 0.34 : 0;
        const strength = segment(progress, 0.055, 0.095);
        const correctionX = (desiredX - heroProjected.x) * strength;
        const correctionY = (desiredY - heroProjected.y) * strength;
        camera.projectionMatrix.elements[8] -= correctionX;
        camera.projectionMatrix.elements[9] -= correctionY;
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        heroProjected.copy(heroWorld).project(camera);
        root.dataset.protagonistX = ((heroProjected.x + 1) / 2).toFixed(3);
        root.dataset.protagonistY = ((1 - heroProjected.y) / 2).toFixed(3);
    };
    const updateScene = (progress) => {
        cameraCurve.getPoint(clamp(linearAt(progress, cameraTiming)), camera.position);
        targetCurve.getPoint(clamp(linearAt(progress, targetTiming)), cameraTarget);
        camera.lookAt(cameraTarget);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();
        solveArm(vectorAt(progress, armKeyframes));
        const fingerGap = numberAt(progress, [
            [0.18, 0.62],
            [0.215, 0.4],
            [0.3, 0.4],
            [0.315, 0.62],
        ]);
        fingerLeft.position.z = fingerGap;
        fingerRight.position.z = -fingerGap;
        sensorMaterial.emissiveIntensity = numberAt(progress, [
            [0.08, 0],
            [0.1, 1.6],
            [0.24, 1.6],
            [0.28, 0],
        ]);
        scanPlane.position.z = numberAt(progress, [
            [0.095, -1.25],
            [0.15, 1.25],
        ]);
        scanMaterial.opacity =
            0.4 *
                Math.min(segment(progress, 0.093, 0.105), 1 - segment(progress, 0.14, 0.152));
        reticleMaterial.opacity = Math.min(segment(progress, 0.145, 0.16), 1 - segment(progress, 0.2, 0.215));
        const reticlePulse = 1 + 0.22 * Math.sin(progress * 620);
        reticle.scale.set(reticlePulse, reticlePulse, 1);
        if (progress > 0.218 && progress <= 0.305) {
            heroBulb.position.set(armTipWorld.x, armTipWorld.y - 1.35, armTipWorld.z);
        }
        else if (progress <= 0.218) {
            heroBulb.position.set(sourceX, 0.8, sourceZ);
        }
        else if (progress < 0.8) {
            heroBulb.position.set(...vectorAt(progress, bulbKeyframes));
        }
        heroBulb.rotation.y = Math.PI * 6 * segment(progress, 0.555, 0.578);
        heroBulb.rotation.z =
            Math.PI *
                Math.min(segment(progress, 0.525, 0.555), 1 - segment(progress, 0.648, 0.675));
        const flip = heroBulb.rotation.z / Math.PI;
        const ignitionEnvelope = segment(progress, 0.578, 0.602);
        const lit = progress < 0.578
            ? 0
            : progress > 0.602
                ? 1
                : ignitionEnvelope * (Math.sin(progress * 2600) > -0.35 ? 1 : 0.15);
        const packed = segment(progress, 0.83, 0.86);
        heroLight.intensity = 40 * lit * (1 - 0.55 * packed);
        heroLight.position.set(heroBulb.position.x, heroBulb.position.y + 0.78 * (1 - 2 * flip), heroBulb.position.z);
        redGlass.emissive.setRGB(0.29 + 0.55 * lit, 0.04 + 0.5 * lit, 0.04 + 0.26 * lit);
        redGlass.emissiveIntensity = 0.7 + 2 * lit;
        redGlass.opacity = 0.9 - 0.18 * lit;
        filamentMaterial.emissiveIntensity = 0.15 + 7 * lit;
        bulbGlow.position.set(heroBulb.position.x, heroBulb.position.y + 0.78 * (1 - 2 * flip), heroBulb.position.z);
        glowMaterial.opacity = 0.75 * lit * (1 - 0.85 * packed);
        const glowSize = 3 + 0.25 * Math.sin(progress * 400);
        bulbGlow.scale.set(glowSize, glowSize, 1);
        const lifterHeight = Math.max(heroBulb.position.x === 24
            ? heroBulb.position.y - 1.18 * flip - 2.3
            : 0, 0.001);
        lifter.scale.y = lifterHeight;
        lifter.position.y = 2.3 + lifterHeight / 2;
        const beltTravel = numberAt(progress, [
            [0.315, 0],
            [0.455, 20],
            [0.7, 20],
            [0.755, 38],
        ]);
        beltStripes.forEach((stripe, index) => {
            stripe.position.x = 4 + ((((index * 3 + beltTravel) % 39) + 39) % 39);
        });
        backgroundParts.forEach((part, index) => {
            part.position.x = 5 + ((((index * 4.3 + progress * 30) % 34) + 34) % 34);
        });
        beacon.rotation.y = progress * 160;
        const vanX = numberAt(progress, [
            [0.905, 47.5],
            [0.985, 76],
        ]);
        if (progress > 0.882) {
            crate.position.set(vanX - 47.5 + 46.35, 0.67, 3.4);
        }
        else {
            crate.position.set(...vectorAt(progress, crateKeyframes));
        }
        lid.rotation.x = -1.85 * (1 - segment(progress, 0.8, 0.832));
        seamMaterial.opacity = lit * 0.9 * segment(progress, 0.79, 0.81);
        if (progress > 0.795) {
            heroBulb.position.set(crate.position.x, crate.position.y + 0.12, crate.position.z);
        }
        van.position.x = vanX;
        const doorOpening = 1.9 *
            Math.min(segment(progress, 0.822, 0.842), 1 - segment(progress, 0.888, 0.902));
        doorLeft.rotation.y = doorOpening;
        doorRight.rotation.y = -doorOpening;
        wheels.forEach((wheel) => {
            wheel.rotation.z = -(vanX - 47.5) / 0.34;
        });
        headlightMaterial.emissiveIntensity = 3 * segment(progress, 0.902, 0.918);
        tailLightMaterial.emissiveIntensity =
            0.5 + 2.5 * segment(progress, 0.9, 0.92);
        const destinationWake = segment(progress, 0.94, 0.985);
        destinationWindowMaterial.emissiveIntensity = 2.2 * destinationWake;
        destinationLight.intensity = 40 * destinationWake;
        destinationGlowMaterial.opacity = 0.55 * destinationWake;
        composeProtagonist(progress);
        updatePanels(progress);
    };
    const measure = () => {
        const bounds = stage.getBoundingClientRect();
        viewportWidth = Math.max(Math.round(bounds.width), 1);
        viewportHeight = Math.max(Math.round(bounds.height), 1);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, viewportWidth < 720 ? 1.35 : 1.75));
        renderer.setSize(viewportWidth, viewportHeight, false);
        camera.aspect = viewportWidth / viewportHeight;
        camera.updateProjectionMatrix();
        storyStart = root.getBoundingClientRect().top + window.scrollY;
        storyRange = Math.max(root.offsetHeight - window.innerHeight, 1);
        targetProgress = clamp((window.scrollY - storyStart) / storyRange);
    };
    const onScroll = () => {
        targetProgress = clamp((window.scrollY - storyStart) / storyRange);
    };
    const jumpHandlers = new Map();
    railButtons.forEach((button, chapter) => {
        const handler = () => {
            measure();
            const top = storyStart + chapterTargets[chapter] * storyRange;
            window.scrollTo({ behavior: "smooth", top });
        };
        jumpHandlers.set(button, handler);
        button.addEventListener("click", handler);
    });
    const render = () => {
        if (destroyed) {
            return;
        }
        animationFrame = window.requestAnimationFrame(render);
        renderedProgress += (targetProgress - renderedProgress) * 0.115;
        if (Math.abs(targetProgress - renderedProgress) < 0.00035) {
            renderedProgress = targetProgress;
        }
        updateScene(renderedProgress);
        renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(stage);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    measure();
    renderedProgress = targetProgress;
    updateScene(renderedProgress);
    renderer.render(scene, camera);
    root.dataset.storyState = "animated";
    animationFrame = window.requestAnimationFrame(render);
    const doorOpenTimer = window.setTimeout(() => {
        doors.classList.add("is-open");
    }, 620);
    const doorRemoveTimer = window.setTimeout(() => {
        doors.classList.add("is-gone");
    }, 2200);
    return {
        destroy() {
            if (destroyed) {
                return;
            }
            destroyed = true;
            window.cancelAnimationFrame(animationFrame);
            window.clearTimeout(doorOpenTimer);
            window.clearTimeout(doorRemoveTimer);
            resizeObserver.disconnect();
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", onScroll);
            jumpHandlers.forEach((handler, button) => {
                button.removeEventListener("click", handler);
            });
            scene.traverse((object) => {
                if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
                    object.geometry.dispose();
                    const objectMaterials = Array.isArray(object.material)
                        ? object.material
                        : [object.material];
                    objectMaterials.forEach((objectMaterial) => objectMaterial.dispose());
                }
            });
            floorTexture.dispose();
            glowTexture.dispose();
            poolTexture.dispose();
            hazardTexture.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        },
    };
}
