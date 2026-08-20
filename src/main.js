import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const canvas = document.querySelector("#scene");
const statusEl = document.querySelector("#status");
const loadingScreen = document.querySelector("#loading-screen");
const loadingProgress = document.querySelector("#loading-progress");
const menu = document.querySelector("#main-menu");
const startButton = document.querySelector("#start-game");
const controlsButton = document.querySelector("#show-controls");
const menuText = document.querySelector("#menu-text");

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

const track = new THREE.Group();
scene.add(track);
const player = { root: track };
let man;
let mixer;
let walkAction;
const loader = new FBXLoader();
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
  windIndex: 0,
  boatBuilt: false,
  inCloudView: false,
  telescopeOn: false,
  messageTimer: 0,
  portalBusy: false
};

const world = {
  bounds: 44,
  platforms: [],
  colliders: [],
  cameraBlocks: [],
  buildables: [],
  portal: null,
  trees: {},
  boat: null,
  windArrow: null
};

const winds = [
  { name: "east", angle: 0, helpful: true },
  { name: "north", angle: Math.PI * 0.5, helpful: false },
  { name: "west", angle: Math.PI, helpful: false },
  { name: "south", angle: Math.PI * 1.5, helpful: false }
];

buildCourtyard();
buildSecondScene();
loadMan();
setStatus("Start from the menu");

startButton.addEventListener("click", () => {
  state.started = true;
  menu.dataset.hidden = "true";
  setStatus("Find the three giant trees");
});

controlsButton.addEventListener("click", () => {
  menuText.textContent =
    "WASD move, Space jump, Shift run. E interact. After unlocks: T teleport mode, Q telescope, 1 build, 2 destruct, click to place/delete.";
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["w", "a", "d", "arrowup", "arrowleft", "arrowright", " ", "shift"].includes(key)) {
    event.preventDefault();
    keys.add(key);
  }
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

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

canvas.addEventListener("pointerdown", (event) => {
  if (!state.started || event.button !== 0) return;
  setPointerTarget(event);
  if (state.canTeleport && state.teleportMode) {
    player.root.position.set(pointerTarget.x, getGroundY(pointerTarget.x, pointerTarget.z), pointerTarget.z);
    createRing(pointerTarget, 0x6bdcff);
    setStatus("Teleported");
    return;
  }
  if (state.canBuild) handleBuildClick(event);
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
  addLake();
  addMainBuilding();
  addCourtyardBuildings();
  addCloudLayer();

  world.trees.first = addGiantTree("first", new THREE.Vector3(-24, 0, -18), 0x3c7f4c);
  addLadder(world.trees.first.group, new THREE.Vector3(1.45, 3.4, 0), 11.5);

  world.trees.second = addGiantTree("second", new THREE.Vector3(25, 0, 15), 0x2f7454);
  world.trees.third = addGiantTree("third", new THREE.Vector3(-18, 0, 24), 0x416d42);
  addParkourRoute();
  addWindDisplay();

  world.portal = createPortal(new THREE.Vector3(0, 0.15, -27));
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

function addLake() {
  const lake = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 12, 0.12, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x2b91b8,
      roughness: 0.16,
      metalness: 0,
      transmission: 0.2,
      transparent: true,
      opacity: 0.82
    })
  );
  lake.scale.z = 0.7;
  lake.position.set(13, 0.03, 14);
  lake.receiveShadow = true;
  courtyardRoot.add(lake);

  const dock = new THREE.Mesh(new THREE.BoxGeometry(4, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0x76533a }));
  dock.position.set(3.7, 0.12, 11.8);
  dock.receiveShadow = true;
  dock.castShadow = true;
  courtyardRoot.add(dock);
}

function addMainBuilding() {
  addBuilding(new THREE.Vector3(0, 0, -30), 18, 6, 7, 0xb44332, true);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.5, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x2b1913, roughness: 0.55 })
  );
  sign.position.set(0, 4.5, -26.42);
  courtyardRoot.add(sign);
}

function addCourtyardBuildings() {
  addBuilding(new THREE.Vector3(-30, 0, 1), 8, 4.6, 32, 0xc65a3d, false);
  addBuilding(new THREE.Vector3(30, 0, 1), 8, 4.6, 32, 0xc65a3d, false);
  addBuilding(new THREE.Vector3(0, 0, 34), 28, 4.2, 7, 0xba4f37, false);
}

function addBuilding(position, width, height, depth, color, hasDoor) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.68 })
  );
  wall.position.set(position.x, height / 2, position.z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  courtyardRoot.add(wall);
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
      new THREE.Vector3(position.x + width / 2, height + 2.2, position.z + depth / 2)
    )
  );

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * 0.62, 2, 4),
    new THREE.MeshStandardMaterial({ color: 0x26313a, roughness: 0.72 })
  );
  roof.position.set(position.x, height + 1.05, position.z);
  roof.rotation.y = Math.PI * 0.25;
  roof.scale.z = depth > width ? 1.45 : 0.5;
  roof.castShadow = true;
  courtyardRoot.add(roof);

  if (hasDoor) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.2, 0.18), new THREE.MeshStandardMaterial({ color: 0x432016 }));
    door.position.set(position.x, 1.6, position.z + depth / 2 + 0.1);
    courtyardRoot.add(door);
  }
}

function addGiantTree(id, position, leafColor) {
  const group = new THREE.Group();
  group.position.copy(position);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 2.1, 19, 18),
    new THREE.MeshStandardMaterial({ color: 0x6b432b, roughness: 0.82 })
  );
  trunk.position.y = 9.5;
  trunk.castShadow = true;
  group.add(trunk);

  const leaves = new THREE.Group();
  const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.8 });
  for (let i = 0; i < 9; i += 1) {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(4.5 - (i % 3) * 0.5, 18, 14), leafMat);
    crown.position.set(Math.cos(i * 1.7) * 2.6, 18 + Math.sin(i) * 1.2, Math.sin(i * 1.3) * 2.6);
    crown.castShadow = true;
    leaves.add(crown);
  }
  group.add(leaves);

  const topPad = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.4, 0.35, 24),
    new THREE.MeshStandardMaterial({ color: 0x5b3927, roughness: 0.75 })
  );
  topPad.position.y = 18.2;
  topPad.castShadow = true;
  group.add(topPad);

  courtyardRoot.add(group);
  world.platforms.push({ x: position.x, z: position.z, width: 6.8, depth: 6.8, y: 18.45, id });
  return { id, group, position, topY: 18.45 };
}

function addLadder(group, offset, height) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xd0a16b, roughness: 0.72 });
  for (let i = 0; i < 2; i += 1) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, height, 0.14), mat);
    rail.position.set(offset.x, offset.y + height / 2, i === 0 ? -0.42 : 0.42);
    group.add(rail);
  }
  for (let y = 0; y < height; y += 0.8) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 1.05), mat);
    step.position.set(offset.x, offset.y + y, 0);
    group.add(step);
  }
}

function addParkourRoute() {
  const platforms = [
    [-24, 4.9, 13, 4.5, 2.3],
    [-29, 7.2, 20, 4, 2],
    [-25, 9.8, 28, 4, 2],
    [-20, 12.4, 30, 4, 2],
    [-17.5, 15.4, 27, 4, 2]
  ];
  platforms.forEach(([x, y, z, w, d]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), new THREE.MeshStandardMaterial({ color: 0xb68b5a }));
    p.position.set(x, y, z);
    p.castShadow = true;
    p.receiveShadow = true;
    courtyardRoot.add(p);
    world.platforms.push({ x, z, width: w, depth: d, y: y + 0.16 });
  });
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

function addWindDisplay() {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 10), new THREE.MeshStandardMaterial({ color: 0x2d343a }));
  base.position.set(1.5, 1.5, 9);
  courtyardRoot.add(base);
  world.windArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(1.5, 3.3, 9), 3.3, 0x2f83ff, 0.7, 0.42);
  courtyardRoot.add(world.windArrow);
  window.setInterval(() => {
    state.windIndex = (state.windIndex + 1) % winds.length;
    const wind = winds[state.windIndex];
    world.windArrow.setDirection(new THREE.Vector3(Math.cos(wind.angle), 0, -Math.sin(wind.angle)).normalize());
    setStatus(`Wind: ${wind.name}${wind.helpful ? " - boat can be built" : ""}`);
  }, 6500);
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
    checkAbilityZones();
    checkPortal();
    updateCamera(delta);
  }
  if (mixer) mixer.update(delta);
  if (walkAction) walkAction.timeScale = isMoving ? walkCycleSpeed * (keys.has("shift") ? 1.45 : 1) : 0;
  controls.update();
  renderer.render(scene, camera);
}

function updateMovement(delta) {
  if (!man) return false;
  const previousX = player.root.position.x;
  const previousZ = player.root.position.z;
  const targetY = getGroundY(player.root.position.x, player.root.position.z);
  const grounded = player.root.position.y <= targetY + 0.04;
  if (grounded) {
    player.root.position.y = targetY;
    state.velocityY = Math.max(0, state.velocityY);
  }

  if (keys.has(" ") && grounded) state.velocityY = 6.1;
  state.velocityY -= 14.5 * delta;

  const turningLeft = keys.has("a") || keys.has("arrowleft");
  const turningRight = keys.has("d") || keys.has("arrowright");
  const forwardPressed = keys.has("w") || keys.has("arrowup");
  const turnSpeed = 1.1;
  if (turningLeft) player.root.rotation.y += delta * turnSpeed;
  if (turningRight) player.root.rotation.y -= delta * turnSpeed;

  move.set(Math.cos(player.root.rotation.y), 0, -Math.sin(player.root.rotation.y)).normalize();
  const shouldWalk = forwardPressed || turningLeft || turningRight;
  if (shouldWalk) {
    const speed = (keys.has("shift") ? 5.9 : 3.35) * (state.canTeleport ? 0.75 : 1);
    player.root.position.addScaledVector(move, speed * delta);
    resolveBuildingCollision(previousX, previousZ);
  }

  player.root.position.y += state.velocityY * delta;
  const newGroundY = getGroundY(player.root.position.x, player.root.position.z);
  if (player.root.position.y < newGroundY) {
    player.root.position.y = newGroundY;
    state.velocityY = 0;
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

  const p = player.root.position;
  const first = world.trees.first.position;
  const second = world.trees.second.position;
  const third = world.trees.third.position;

  if (horizontalDistance(p, first) < 4.2 && p.y < 5) {
    player.root.position.set(first.x, 24.5, first.z);
    state.velocityY = 0;
    state.inCloudView = true;
    unlockTeleport();
    setStatus("You climbed above the clouds. Teleport unlocked.");
    return;
  }

  if (!state.boatBuilt && horizontalDistance(p, new THREE.Vector3(3.7, 0, 11.8)) < 4) {
    const wind = winds[state.windIndex];
    if (wind.helpful) {
      buildBoat();
      setStatus("Boat built. Cross the lake to the second tree.");
    } else {
      setStatus(`Wind is ${wind.name}. Wait for east wind to build the boat.`);
    }
    return;
  }

  if (horizontalDistance(p, second) < 4.6) {
    unlockTelescope();
    setStatus("Second tree reached. Telescope unlocked. Press Q.");
    return;
  }

  if (horizontalDistance(p, third) < 4.4 && p.y > 15) {
    unlockBuildPower();
    setStatus("Third tree top reached. Build/destruct unlocked.");
    return;
  }
}

function checkAbilityZones() {
  const p = player.root.position;
  if (!state.canTeleport && horizontalDistance(p, world.trees.first.position) < 4.4 && p.y > 17.2) {
    unlockTeleport();
    setStatus("Teleport unlocked. Press T, then click to blink around.");
  }
  if (!state.hasTelescope && horizontalDistance(p, world.trees.second.position) < 4.4 && p.y > 17.2) {
    unlockTelescope();
    setStatus("Telescope unlocked. Press Q to zoom.");
  }
  if (!state.canBuild && horizontalDistance(p, world.trees.third.position) < 4.4 && p.y > 17.2) {
    unlockBuildPower();
    setStatus("Build/destruct unlocked. Press 1 or 2, then click.");
  }
}

function unlockTeleport() {
  state.canTeleport = true;
}

function unlockTelescope() {
  state.hasTelescope = true;
}

function unlockBuildPower() {
  state.canBuild = true;
}

function buildBoat() {
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 1.25), new THREE.MeshStandardMaterial({ color: 0x8b5a35, roughness: 0.72 }));
  hull.castShadow = true;
  boat.add(hull);
  const sail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.7, 3), new THREE.MeshStandardMaterial({ color: 0xf3ead2, roughness: 0.5, side: THREE.DoubleSide }));
  sail.position.set(0, 1.55, 0);
  sail.rotation.z = Math.PI * 0.5;
  boat.add(sail);
  boat.position.set(13, 0.42, 14);
  courtyardRoot.add(boat);
  world.boat = boat;
  state.boatBuilt = true;

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(16, 0.18, 1.4), new THREE.MeshStandardMaterial({ color: 0x8b5a35, roughness: 0.7 }));
  bridge.position.set(14.4, 0.23, 13.2);
  bridge.castShadow = true;
  bridge.receiveShadow = true;
  courtyardRoot.add(bridge);
  world.platforms.push({ x: 14.4, z: 13.2, width: 16, depth: 1.4, y: 0.36 });
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
