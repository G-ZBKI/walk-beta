import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.querySelector("#scene");
const statusEl = document.querySelector("#status");
const loadingScreen = document.querySelector("#loading-screen");
const loadingProgress = document.querySelector("#loading-progress");
const menu = document.querySelector("#main-menu");
const startButton = document.querySelector("#start-game");
const controlsButton = document.querySelector("#show-controls");
const menuText = document.querySelector("#menu-text");
const fpsCounter = document.querySelector("#fps-counter");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9d8ee);
scene.fog = new THREE.Fog(0xb9d8ee, 55, 190);

const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 320);
camera.position.set(6, 4.2, 8.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableRotate = false;
controls.target.set(0, 1.45, 0);
controls.minDistance = 4.5;
controls.maxDistance = 34;
controls.maxPolarAngle = Math.PI * 0.48;

scene.add(new THREE.HemisphereLight(0xf8fbff, 0x716250, 1.45));
const sun = new THREE.DirectionalLight(0xfff1d0, 3.4);
sun.position.set(18, 28, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
scene.add(sun);

const courtyardRoot = new THREE.Group();
const secondRoot = new THREE.Group();
secondRoot.visible = false;
scene.add(courtyardRoot, secondRoot);

const clock = new THREE.Clock();
const keys = new Set();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointerTarget = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const temp = new THREE.Vector3();
const mouseMove = {
  active: false,
  target: new THREE.Vector3()
};
const grassPatches = [];
const courtyardClouds = [];

const track = new THREE.Group();
scene.add(track);
const player = { root: track };
let man;
let mixer;
let walkAction;
const loader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const grassTextures = {
  color: textureLoader.load("./assets/grass/gm.png"),
  alpha: textureLoader.load("./assets/grass/gm_Opacity.png"),
  normal: textureLoader.load("./assets/grass/gm_Normal.png")
};
grassTextures.color.colorSpace = THREE.SRGBColorSpace;
const rockTextures = [
  {
    color: textureLoader.load("./assets/rocks/textures/albedo_rock01.jpeg"),
    normal: textureLoader.load("./assets/rocks/textures/normals_rock01.jpeg")
  },
  {
    color: textureLoader.load("./assets/rocks/textures/albedo_rock07.jpeg"),
    normal: textureLoader.load("./assets/rocks/textures/normals_rock07.jpeg")
  },
  {
    color: textureLoader.load("./assets/rocks/textures/albedo_rock20.jpeg"),
    normal: textureLoader.load("./assets/rocks/textures/normals_rock20.jpeg")
  }
];
rockTextures.forEach((entry) => {
  entry.color.colorSpace = THREE.SRGBColorSpace;
});
const cloudTexture = textureLoader.load("./assets/cloud/textures/texture1.png");
cloudTexture.colorSpace = THREE.SRGBColorSpace;
const walkCycleSpeed = 0.9;
const followCamera = {
  height: 3.15,
  distance: 5.8,
  minDistance: 1.9,
  shoulder: 0
};
const worldUp = new THREE.Vector3(0, 1, 0);
const cameraRight = new THREE.Vector3();
const manForward = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const cameraSideOffset = new THREE.Vector3();
const cameraTestPosition = new THREE.Vector3();

const state = {
  started: false,
  world: "courtyard",
  velocityY: 0,
  canTeleport: false,
  hasTelescope: false,
  canBuild: false,
  teleportMode: false,
  buildMode: "build",
  inCloudView: false,
  telescopeOn: false,
  messageTimer: 0,
  portalBusy: false,
  fpsFrames: 0,
  fpsElapsed: 0,
  cheatBuffer: "",
  flyUnlocked: false,
  flying: false,
  lastSpaceTap: 0
};

const world = {
  bounds: 44,
  platforms: [],
  colliders: [],
  cameraBlocks: [],
  buildables: [],
  portal: null
};

buildCourtyard();
buildSecondScene();
loadMan();
setStatus("Start from the menu");

startButton.addEventListener("click", () => {
  state.started = true;
  menu.dataset.hidden = "true";
  setStatus("Explore the courtyard");
});

controlsButton.addEventListener("click", () => {
  menuText.textContent =
    "W or hold left mouse to walk. A/D turn. Space jumps. Shift runs. Type cheat, then double-tap Space to fly. Hold Space up, Shift down.";
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  recordCheatCode(key);
  if (["w", "a", "d", "arrowup", "arrowleft", "arrowright", " ", "shift"].includes(key)) {
    event.preventDefault();
    keys.add(key);
  }
  if (key === " " && state.flyUnlocked && !event.repeat) handleFlyToggle();
  if (key === "e") interact();
  if (key === "t" && state.canTeleport) {
    state.teleportMode = !state.teleportMode;
    setStatus(state.teleportMode ? "Teleport mode: click anywhere in the yard" : "Teleport mode off");
  }
  if (key === "q" && state.hasTelescope) toggleTelescope();
  if (key === "1" && state.canBuild) {
    state.buildMode = "build";
    setStatus("Build mode: click to place blocks");
  }
  if (key === "2" && state.canBuild) {
    state.buildMode = "destruct";
    setStatus("Destruct mode: click your blocks to remove them");
  }
});

function recordCheatCode(key) {
  if (key.length !== 1 || !/[a-z]/.test(key)) return;
  state.cheatBuffer = `${state.cheatBuffer}${key}`.slice(-5);
  if (state.cheatBuffer !== "cheat" || state.flyUnlocked) return;
  state.flyUnlocked = true;
  setStatus("Cheat unlocked. Double-tap Space to fly.");
}

function handleFlyToggle() {
  const now = performance.now();
  if (now - state.lastSpaceTap < 320) {
    state.flying = !state.flying;
    state.velocityY = 0;
    setStatus(state.flying ? "Flying on. Hold Space up, Shift down." : "Flying off");
    state.lastSpaceTap = 0;
    return;
  }
  state.lastSpaceTap = now;
}

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

canvas.addEventListener("pointerdown", (event) => {
  if (!state.started || event.button !== 0) return;
  setPointerTarget(event);
  mouseMove.active = true;
  mouseMove.target.copy(pointerTarget);
  if (state.canTeleport && state.teleportMode) {
    player.root.position.set(pointerTarget.x, getGroundY(pointerTarget.x, pointerTarget.z), pointerTarget.z);
    createRing(pointerTarget, 0x6bdcff);
    setStatus("Teleported");
    return;
  }
  if (state.canBuild) handleBuildClick(event);
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.started || !mouseMove.active) return;
  setPointerTarget(event);
  mouseMove.target.copy(pointerTarget);
});

window.addEventListener("pointerup", () => {
  mouseMove.active = false;
});

function buildCourtyard() {
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(90, 0.14, 90),
    new THREE.MeshStandardMaterial({ color: 0xb9b09f, roughness: 0.86 })
  );
  ground.position.y = -0.07;
  ground.receiveShadow = true;
  courtyardRoot.add(ground);

  addPaving();
  loadImperialBuildings();
  addGrassField();
  addCloudLayer();
  addTexturedClouds();
  addRockField();

  world.portal = createPortal(new THREE.Vector3(0, 0.15, -24.4));
  courtyardRoot.add(world.portal);
}

function addPaving() {
  const matA = new THREE.MeshStandardMaterial({ color: 0xd5c8ae, roughness: 0.78 });
  const matB = new THREE.MeshStandardMaterial({ color: 0xa9957b, roughness: 0.82 });
  for (let x = -10; x <= 10; x += 2) {
    for (let z = -10; z <= 10; z += 2) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.05, 1.85), (x + z) % 4 === 0 ? matA : matB);
      tile.position.set(x, 0.02, z);
      tile.receiveShadow = true;
      courtyardRoot.add(tile);
    }
  }
}

function addGrassField() {
  const grassMaterial = new THREE.MeshStandardMaterial({
    map: grassTextures.color,
    alphaMap: grassTextures.alpha,
    normalMap: grassTextures.normal,
    color: 0xd9ffd0,
    roughness: 0.78,
    transparent: true,
    alphaTest: 0.32,
    side: THREE.DoubleSide
  });
  const bladeGeometry = new THREE.PlaneGeometry(1.25, 0.82, 2, 3);
  bladeGeometry.translate(0, 0.41, 0);

  for (let i = 0; i < 190; i += 1) {
    const x = seededRange(i, 1, -40, 40);
    const z = seededRange(i, 2, -40, 40);
    if (!canPlaceGrass(x, z)) continue;

    const patch = new THREE.Group();
    const scale = seededRange(i, 3, 0.75, 1.55);
    const blades = 2;
    for (let bladeIndex = 0; bladeIndex < blades; bladeIndex += 1) {
      const blade = new THREE.Mesh(bladeGeometry, grassMaterial);
      blade.rotation.y = (Math.PI / blades) * bladeIndex + seededRange(i + bladeIndex, 5, -0.22, 0.22);
      blade.scale.setScalar(scale * seededRange(i + bladeIndex, 6, 0.82, 1.18));
      blade.castShadow = true;
      patch.add(blade);
    }
    patch.position.set(x, 0.02, z);
    patch.rotation.y = seededRange(i, 7, 0, Math.PI * 2);
    patch.userData.phase = seededRange(i, 8, 0, Math.PI * 2);
    patch.userData.sway = seededRange(i, 9, 0.045, 0.12);
    grassPatches.push(patch);
    courtyardRoot.add(patch);
  }
}

function canPlaceGrass(x, z) {
  if (Math.abs(x) < 13 && Math.abs(z) < 13) return false;
  if (horizontalDistance(new THREE.Vector3(x, 0, z), new THREE.Vector3(0, 0, -27)) < 5.4) return false;
  return !isInsideBuildingAt(x, z, 0);
}

function loadImperialBuildings() {
  gltfLoader.load(
    "./assets/imperial-building/scene.gltf",
    (gltf) => {
      const source = new THREE.Group();
      source.add(gltf.scene);
      prepareImperialBuilding(source);
      const placements = [
        { position: new THREE.Vector3(0, 0.02, -30), rotation: 0, scale: 8.6 },
        { position: new THREE.Vector3(-25, 0.02, 5), rotation: Math.PI * 0.5, scale: 6.8 },
        { position: new THREE.Vector3(25, 0.02, 6), rotation: -Math.PI * 0.5, scale: 6.8 },
        { position: new THREE.Vector3(0, 0.02, 34), rotation: Math.PI, scale: 7.3 }
      ];

      placements.forEach(({ position, rotation, scale }) => {
        const building = source.clone(true);
        building.position.copy(position);
        building.rotation.y = rotation;
        building.scale.multiplyScalar(scale);
        courtyardRoot.add(building);
        addLoadedBuildingCollision(position, 6.6 * scale / 5, 6.2 * scale / 5, 4.8 * scale / 5);
      });
      setStatus("Imperial buildings loaded");
    },
    undefined,
    (error) => {
      console.error(error);
      setStatus("Could not load imperial buildings");
    }
  );
}

function prepareImperialBuilding(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.roughness = Math.max(material.roughness ?? 0.65, 0.58);
      material.needsUpdate = true;
    });
  });
  normalizeObjectToHeight(object, 1);
}

function normalizeObjectToHeight(object, targetHeight) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  object.scale.multiplyScalar(targetHeight / Math.max(size.y, 0.001));

  object.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= scaledBox.min.y;
}

function addLoadedBuildingCollision(position, width, depth, height) {
  world.platforms.push({ x: position.x, z: position.z, width, depth, y: height + 0.2 });
  world.colliders.push({
    x: position.x,
    z: position.z,
    width,
    depth,
    height,
    padding: 0.32
  });
  world.cameraBlocks.push(
    new THREE.Box3(
      new THREE.Vector3(position.x - width / 2, 0, position.z - depth / 2),
      new THREE.Vector3(position.x + width / 2, height + 1.4, position.z + depth / 2)
    )
  );
}

function addCloudLayer() {
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false });
  for (let i = 0; i < 22; i += 1) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(2 + (i % 4) * 0.5, 14, 10), cloudMat);
    cloud.position.set(-38 + i * 3.8, 25 + Math.sin(i) * 2, -24 + Math.cos(i * 1.4) * 16);
    cloud.scale.x = 1.9;
    courtyardRoot.add(cloud);
  }
}

function addTexturedClouds() {
  const material = new THREE.MeshStandardMaterial({
    map: cloudTexture,
    color: 0xffffff,
    roughness: 0.62,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const positions = [
    [-35, 34, -42, 8],
    [-12, 39, -48, 9],
    [18, 36, -45, 8],
    [38, 40, -24, 7],
    [-42, 38, 10, 7],
    [16, 42, 38, 8],
    [-18, 44, 41, 7],
    [42, 37, 25, 7]
  ];
  positions.forEach(([x, y, z, scale], index) => {
    const cloud = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      const puff = new THREE.Mesh(new THREE.PlaneGeometry(scale * (1.4 + i * 0.12), scale * 0.72), material);
      puff.position.set((i - 1.5) * scale * 0.55, Math.sin(i) * scale * 0.12, seededRange(index + i, 31, -0.25, 0.25));
      puff.rotation.y = seededRange(index + i, 32, -0.35, 0.35);
      cloud.add(puff);
    }
    cloud.position.set(x, y, z);
    cloud.lookAt(0, y - 3, 0);
    cloud.userData.phase = index * 0.64;
    courtyardClouds.push(cloud);
    courtyardRoot.add(cloud);
  });
}

function addRockField() {
  const materials = rockTextures.map((entry) => new THREE.MeshStandardMaterial({
    map: entry.color,
    normalMap: entry.normal,
    roughness: 0.86,
    color: 0xd3c6ad
  }));
  const positions = [
    [-38, -24, 0.72],
    [-30, -8, 0.55],
    [-24, 32, 0.62],
    [-9, 25, 0.45],
    [17, -31, 0.58],
    [28, -17, 0.66],
    [34, 11, 0.48],
    [21, 28, 0.6],
    [-37, 19, 0.52],
    [5, 39, 0.5],
    [39, -35, 0.46],
    [-15, -38, 0.56],
    [-41, 2, 0.5],
    [41, -4, 0.54],
    [31, 36, 0.48],
    [-33, -36, 0.6]
  ];
  positions.forEach(([x, z, scale], index) => {
    if (!canPlaceProp(x, z)) return;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1, 0),
      materials[index % materials.length]
    );
    rock.position.set(x, 0.18 * scale, z);
    rock.rotation.set(seededRange(index, 14, -0.4, 0.4), seededRange(index, 16, 0, Math.PI * 2), seededRange(index, 15, -0.24, 0.24));
    rock.scale.set(scale * seededRange(index, 17, 0.75, 1.25), scale * seededRange(index, 18, 0.28, 0.48), scale * seededRange(index, 19, 0.72, 1.2));
    rock.castShadow = true;
    rock.receiveShadow = true;
    courtyardRoot.add(rock);
    world.colliders.push({ x, z, width: 1.4 * scale, depth: 1.4 * scale, height: 0.75, padding: 0.12 });
  });
}

function canPlaceProp(x, z) {
  if (Math.abs(x) < 12 && Math.abs(z) < 12) return false;
  if (horizontalDistance(new THREE.Vector3(x, 0, z), new THREE.Vector3(0, 0, -27)) < 6) return false;
  return !isInsideBuildingAt(x, z, 0);
}

function createPortal(position) {
  const group = new THREE.Group();
  group.position.copy(position);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.7, 0.18, 16, 60),
    new THREE.MeshStandardMaterial({ color: 0x7bdcff, emissive: 0x1a98ff, emissiveIntensity: 1.2, toneMapped: false })
  );
  ring.rotation.y = Math.PI * 0.5;
  group.add(ring);
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(1.42, 48),
    new THREE.MeshBasicMaterial({ color: 0x7d63ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  core.rotation.y = Math.PI * 0.5;
  group.add(core);
  return group;
}

function buildSecondScene() {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 60), new THREE.MeshStandardMaterial({ color: 0x38404b, roughness: 0.75 }));
  floor.receiveShadow = true;
  secondRoot.add(floor);
  const marker = new THREE.Mesh(new THREE.TorusKnotGeometry(2, 0.18, 80, 10), new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0x5b3300, emissiveIntensity: 0.5 }));
  marker.position.set(0, 4, -8);
  secondRoot.add(marker);
}

function loadMan() {
  loader.load(
    "./assets/source/Mr_Man_Walking.fbx",
    (object) => {
      man = object;
      normalizeModel(man);
      track.add(man);

      mixer = new THREE.AnimationMixer(man);
      if (man.animations.length > 0) {
        walkAction = mixer.clipAction(man.animations[0]);
        walkAction.timeScale = 0;
        walkAction.play();
      }

      setStatus("Original walking man loaded");
    },
    (event) => {
      if (event.total > 0 && !state.started) {
        const progress = Math.round((event.loaded / event.total) * 100);
        setStatus(`Loading man ${progress}%`);
      }
    },
    (error) => {
      console.error(error);
      setStatus("Could not load the original walking man");
    }
  );
}

function normalizeModel(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
    });
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const targetHeight = 1.28;
  const scale = targetHeight / Math.max(size.y, 0.001);
  object.scale.multiplyScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(object);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  object.position.x -= scaledCenter.x;
  object.position.z -= scaledCenter.z;
  object.position.y -= scaledBox.min.y;
  object.rotation.y = Math.PI * 0.5;
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  let isMoving = false;
  if (state.started) {
    isMoving = updateMovement(delta);
    checkPortal();
    updateCamera(delta);
  }
  updateGrass(delta);
  updateClouds(delta);
  updateFps(delta);
  if (mixer) mixer.update(delta);
  if (walkAction) walkAction.timeScale = isMoving ? walkCycleSpeed * (keys.has("shift") ? 1.45 : 1) : 0;
  controls.update();
  renderer.render(scene, camera);
}

function updateGrass(delta) {
  const time = clock.elapsedTime;
  grassPatches.forEach((patch) => {
    patch.rotation.z = Math.sin(time * 1.7 + patch.userData.phase) * patch.userData.sway;
    patch.rotation.x = Math.cos(time * 1.35 + patch.userData.phase) * patch.userData.sway * 0.42;
  });
}

function updateClouds(delta) {
  const time = clock.elapsedTime;
  courtyardClouds.forEach((cloud) => {
    cloud.position.x += delta * 0.32;
    cloud.position.y += Math.sin(time * 0.45 + cloud.userData.phase) * delta * 0.18;
    if (cloud.position.x > 48) cloud.position.x = -48;
  });
}

function updateFps(delta) {
  state.fpsFrames += 1;
  state.fpsElapsed += delta;
  if (state.fpsElapsed < 0.35) return;
  const fps = Math.round(state.fpsFrames / state.fpsElapsed);
  fpsCounter.textContent = `FPS ${fps}`;
  state.fpsFrames = 0;
  state.fpsElapsed = 0;
}

function updateMovement(delta) {
  if (!man) return false;
  const previousX = player.root.position.x;
  const previousZ = player.root.position.z;
  const targetY = getGroundY(player.root.position.x, player.root.position.z);
  const grounded = player.root.position.y <= targetY + 0.04;
  if (!state.flying && grounded) {
    player.root.position.y = targetY;
    state.velocityY = Math.max(0, state.velocityY);
  }

  if (state.flying) {
    state.velocityY = 0;
  } else {
    if (keys.has(" ") && grounded) state.velocityY = 6.1;
    state.velocityY -= 14.5 * delta;
  }

  const turningLeft = keys.has("a") || keys.has("arrowleft");
  const turningRight = keys.has("d") || keys.has("arrowright");
  const forwardPressed = keys.has("w") || keys.has("arrowup");
  const mouseDirection = mouseMove.target.clone().sub(player.root.position);
  mouseDirection.y = 0;
  const mouseWalking = mouseMove.active && mouseDirection.lengthSq() > 0.35;
  const turnSpeed = 1.1;
  if (turningLeft) player.root.rotation.y += delta * turnSpeed;
  if (turningRight) player.root.rotation.y -= delta * turnSpeed;

  if (mouseWalking) {
    mouseDirection.normalize();
    const targetFacing = Math.atan2(-mouseDirection.z, mouseDirection.x);
    let deltaAngle = targetFacing - player.root.rotation.y;
    deltaAngle = Math.atan2(Math.sin(deltaAngle), Math.cos(deltaAngle));
    player.root.rotation.y += deltaAngle * Math.min(1, delta * 10);
    move.copy(mouseDirection);
  } else {
    move.set(Math.cos(player.root.rotation.y), 0, -Math.sin(player.root.rotation.y)).normalize();
  }

  const shouldWalk = forwardPressed || turningLeft || turningRight || mouseWalking;
  if (shouldWalk) {
    const speed = (!state.flying && keys.has("shift") ? 5.9 : 3.35) * (state.canTeleport ? 0.75 : 1);
    player.root.position.addScaledVector(move, speed * delta);
    resolveBuildingCollision(previousX, previousZ);
  }

  if (state.flying) {
    if (keys.has(" ")) player.root.position.y += 6.2 * delta;
    if (keys.has("shift")) player.root.position.y -= 6.2 * delta;
  } else {
    player.root.position.y += state.velocityY * delta;
  }
  const newGroundY = getGroundY(player.root.position.x, player.root.position.z);
  if (player.root.position.y < newGroundY) {
    player.root.position.y = newGroundY;
    state.velocityY = 0;
    if (state.flying) state.flying = false;
  }

  const bounds = state.world === "courtyard" ? world.bounds : 28;
  player.root.position.x = THREE.MathUtils.clamp(player.root.position.x, -bounds, bounds);
  player.root.position.z = THREE.MathUtils.clamp(player.root.position.z, -bounds, bounds);
  return shouldWalk;
}

function resolveBuildingCollision(previousX, previousZ) {
  if (state.world !== "courtyard") return;
  const y = player.root.position.y;
  const hitsBuilding = world.colliders.some((collider) => {
    if (y > collider.height - 0.15) return false;
    return (
      Math.abs(player.root.position.x - collider.x) < collider.width / 2 + collider.padding &&
      Math.abs(player.root.position.z - collider.z) < collider.depth / 2 + collider.padding
    );
  });
  if (!hitsBuilding) return;

  const testX = player.root.position.x;
  const testZ = player.root.position.z;
  player.root.position.x = previousX;
  if (!isInsideBuildingAt(player.root.position.x, testZ, y)) {
    player.root.position.z = testZ;
    return;
  }
  player.root.position.z = previousZ;
  if (!isInsideBuildingAt(testX, player.root.position.z, y)) {
    player.root.position.x = testX;
  }
}

function isInsideBuildingAt(x, z, y) {
  if (state.world !== "courtyard") return false;
  return world.colliders.some((collider) => {
    if (y > collider.height - 0.15) return false;
    return (
      Math.abs(x - collider.x) < collider.width / 2 + collider.padding &&
      Math.abs(z - collider.z) < collider.depth / 2 + collider.padding
    );
  });
}

function getGroundY(x, z) {
  let y = 0;
  if (state.world !== "courtyard") return 0;
  world.platforms.forEach((platform) => {
    const insideX = Math.abs(x - platform.x) <= platform.width / 2;
    const insideZ = Math.abs(z - platform.z) <= platform.depth / 2;
    if (insideX && insideZ && player.root.position.y >= platform.y - 1.2) y = Math.max(y, platform.y);
  });
  world.buildables.forEach((block) => {
    const pos = block.position;
    if (Math.abs(x - pos.x) <= 0.8 && Math.abs(z - pos.z) <= 0.8 && player.root.position.y >= pos.y + 0.45) {
      y = Math.max(y, pos.y + 0.8);
    }
  });
  return y;
}

function interact() {
  if (!state.started || state.world !== "courtyard") return;
  setStatus("Walk into the portal by the imperial building.");
}

function toggleTelescope() {
  state.telescopeOn = !state.telescopeOn;
  camera.fov = state.telescopeOn ? 18 : 48;
  camera.updateProjectionMatrix();
  setStatus(state.telescopeOn ? "Telescope on" : "Telescope off");
}

function handleBuildClick(event) {
  setPointerTarget(event);
  if (state.buildMode === "build") {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xd4a24c, roughness: 0.68 })
    );
    block.position.set(
      Math.round(pointerTarget.x / 1.4) * 1.4,
      getGroundY(pointerTarget.x, pointerTarget.z) + 0.7,
      Math.round(pointerTarget.z / 1.4) * 1.4
    );
    block.castShadow = true;
    block.receiveShadow = true;
    block.userData.buildable = true;
    courtyardRoot.add(block);
    world.buildables.push(block);
    setStatus("Built a block");
    return;
  }

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(world.buildables, false);
  if (hits.length > 0) {
    const block = hits[0].object;
    courtyardRoot.remove(block);
    world.buildables = world.buildables.filter((item) => item !== block);
    block.geometry.dispose();
    block.material.dispose();
    setStatus("Destroyed a block");
  }
}

function checkPortal() {
  if (state.world !== "courtyard" || state.portalBusy) return;
  if (horizontalDistance(player.root.position, world.portal.position) < 2.2) {
    state.portalBusy = true;
    showLoadingScreen();
    window.setTimeout(() => {
      state.world = "second";
      courtyardRoot.visible = false;
      secondRoot.visible = true;
      player.root.position.set(0, 0, 12);
      scene.background = new THREE.Color(0x1d2530);
      scene.fog = new THREE.Fog(0x1d2530, 35, 120);
      hideLoadingScreen();
      setStatus("Second scene placeholder. You can build this later.");
      state.portalBusy = false;
    }, 800);
  }
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function seededRange(index, salt, min, max) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  const normalized = value - Math.floor(value);
  return min + (max - min) * normalized;
}

function setPointerTarget(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(groundPlane, pointerTarget);
}

function createRing(position, color) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.75, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, position.y + 0.04, position.z);
  courtyardRoot.add(ring);
  window.setTimeout(() => {
    courtyardRoot.remove(ring);
    ring.geometry.dispose();
    ring.material.dispose();
  }, 650);
}

function updateCamera(delta) {
  manForward.set(Math.cos(player.root.rotation.y), 0, -Math.sin(player.root.rotation.y)).normalize();
  cameraRight.crossVectors(manForward, worldUp).normalize();
  cameraSideOffset.copy(cameraRight).multiplyScalar(followCamera.shoulder);

  cameraLookTarget.copy(player.root.position).addScaledVector(manForward, 1.15);
  cameraLookTarget.y += state.telescopeOn ? 1.28 : 0.96;

  if (state.telescopeOn) {
    desiredCameraPosition.copy(player.root.position).addScaledVector(manForward, -1.9);
    desiredCameraPosition.y += 2.1;
  } else {
    placeCameraBehindPlayer();
  }

  if (state.inCloudView && player.root.position.y > 20) desiredCameraPosition.y += 5.5;
  camera.position.lerp(desiredCameraPosition, Math.min(1, delta * 7.5));
  controls.target.lerp(cameraLookTarget, Math.min(1, delta * 9));
}

function placeCameraBehindPlayer() {
  for (let distance = followCamera.distance; distance >= followCamera.minDistance; distance -= 0.45) {
    cameraTestPosition
      .copy(player.root.position)
      .addScaledVector(manForward, -distance)
      .add(cameraSideOffset);
    cameraTestPosition.y = player.root.position.y + followCamera.height;

    if (!isCameraInsideBuilding(cameraTestPosition)) {
      desiredCameraPosition.copy(cameraTestPosition);
      return;
    }
  }

  desiredCameraPosition
    .copy(player.root.position)
    .addScaledVector(manForward, -followCamera.minDistance)
    .add(cameraSideOffset);
  desiredCameraPosition.y = player.root.position.y + followCamera.height + 0.6;
}

function isCameraInsideBuilding(position) {
  if (state.world !== "courtyard") return false;
  return world.cameraBlocks.some((box) => {
    if (position.y < box.min.y || position.y > box.max.y) return false;
    return (
      position.x > box.min.x - 0.22 &&
      position.x < box.max.x + 0.22 &&
      position.z > box.min.z - 0.22 &&
      position.z < box.max.z + 0.22
    );
  });
}

function setStatus(text) {
  statusEl.textContent = text;
  statusEl.dataset.ready = "false";
  window.clearTimeout(state.messageTimer);
  state.messageTimer = window.setTimeout(() => {
    statusEl.dataset.ready = "true";
  }, 2600);
}

function showLoadingScreen() {
  loadingProgress.style.width = "0%";
  loadingScreen.dataset.visible = "true";
  window.setTimeout(() => {
    loadingProgress.style.width = "100%";
  }, 60);
}

function hideLoadingScreen() {
  loadingScreen.dataset.visible = "false";
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
