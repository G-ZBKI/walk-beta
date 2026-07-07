import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

const canvas = document.querySelector("#scene");
const statusEl = document.querySelector("#status");
const loadingScreen = document.querySelector("#loading-screen");
const loadingProgress = document.querySelector("#loading-progress");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x22303c);
scene.fog = new THREE.Fog(0x22303c, 55, 185);

const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 260);
camera.position.set(6, 4.2, 8.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableRotate = false;
controls.target.set(0, 1.45, 0);
controls.minDistance = 4.5;
controls.maxDistance = 34;
controls.maxPolarAngle = Math.PI * 0.48;

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
scene.add(new THREE.HemisphereLight(0xf7fbff, 0x4a453b, 2.25));

const keyLight = new THREE.DirectionalLight(0xfff3d9, 5.1);
keyLight.position.set(7, 11, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 44;
keyLight.shadow.camera.left = -14;
keyLight.shadow.camera.right = 14;
keyLight.shadow.camera.top = 14;
keyLight.shadow.camera.bottom = -14;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xb6dcff, 2.4);
rimLight.position.set(-8, 6, -8);
scene.add(rimLight);

const checkerTexture = makeCheckerTexture();
checkerTexture.wrapS = THREE.RepeatWrapping;
checkerTexture.wrapT = THREE.RepeatWrapping;
checkerTexture.repeat.set(16, 16);
checkerTexture.colorSpace = THREE.SRGBColorSpace;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(54, 54),
  new THREE.MeshStandardMaterial({
    map: checkerTexture,
    roughness: 0.78,
    metalness: 0.02,
    transparent: true,
    opacity: 0.92
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.015;
ground.receiveShadow = true;
scene.add(ground);

const cityRoot = new THREE.Group();
scene.add(cityRoot);

const portalRoot = new THREE.Group();
scene.add(portalRoot);

const mountainRoot = new THREE.Group();
mountainRoot.visible = false;
scene.add(mountainRoot);

const track = new THREE.Group();
scene.add(track);

let mixer;
let man;
let walkAction;
let city;
let portalMixer;
const strideSpeed = 0.48;
const walkCycleSpeed = 0.9;
const runMultiplier = 1.75;
const loaded = { city: false, man: false, portal: false, mountain: false };
let activeWorld = "city";
let isWorldTransitioning = false;
const keys = new Set();
let verticalVelocity = 0;
let jumpOffset = 0;
const jumpSettings = {
  strength: 4.2,
  gravity: 10.5
};
const moveDirection = new THREE.Vector3();
const mouseDirection = new THREE.Vector3();
const candidatePosition = new THREE.Vector3();
const xSlidePosition = new THREE.Vector3();
const zSlidePosition = new THREE.Vector3();
const cameraTestPosition = new THREE.Vector3();
const movementForward = new THREE.Vector3();
const pointer = new THREE.Vector2();
const groundTarget = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const manForward = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const cameraSideOffset = new THREE.Vector3();
const followCamera = {
  height: 3.15,
  distance: 5.8,
  minDistance: 1.9,
  shoulder: 0.9
};
const worldUp = new THREE.Vector3(0, 1, 0);
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const worldSettings = {
  city: {
    boundsRadius: 22,
    background: new THREE.Color(0x22303c),
    fog: new THREE.Fog(0x22303c, 55, 185)
  },
  mountain: {
    boundsRadius: 15.5,
    background: new THREE.Color(0xbfdff1),
    fog: new THREE.Fog(0xbfdff1, 35, 130)
  }
};
const playerCollider = { radius: 0.3, height: 1.28 };
const cityColliders = [];
const mountainColliders = [];
let activeColliders = cityColliders;
const portalTrigger = {
  position: new THREE.Vector3(3.45, 0, -5.4),
  radius: 2.2
};
const mouseControl = {
  active: false,
  pointerDown: false,
  target: new THREE.Vector3()
};
const islandAssets = { island: false, cloud: false };
const animatedTrees = [];
const peaches = [];
let pickedPeaches = 0;
let pickupMessageTimer;
const peachArrow = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 2.25, 0),
  2.15,
  0x22aaff,
  0.7,
  0.42
);
peachArrow.visible = false;
scene.add(peachArrow);
const clock = new THREE.Clock();

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["w", "a", "d", "arrowup", "arrowleft", "arrowright", " ", "shift"].includes(key)) {
    event.preventDefault();
    if (key === " " && jumpOffset <= 0.001) {
      verticalVelocity = jumpSettings.strength;
    } else {
      keys.add(key);
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

window.addEventListener("blur", () => {
  keys.clear();
  mouseControl.pointerDown = false;
  mouseControl.active = false;
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  mouseControl.pointerDown = true;
  setMouseTarget(event);
});

canvas.addEventListener("pointermove", (event) => {
  if (mouseControl.pointerDown) setMouseTarget(event);
});

window.addEventListener("pointerup", () => {
  mouseControl.pointerDown = false;
  mouseControl.active = false;
});

const manager = new THREE.LoadingManager();
manager.setURLModifier((url) => {
  if (url.startsWith("./assets/") || url.startsWith("assets/")) {
    return url;
  }
  const fileName = url.split(/[\\/]/).pop();
  if (fileName && /\.tga$/i.test(fileName)) {
    return `./assets/textures/${fileName}.png`;
  }
  if (fileName && /\.(png|jpe?g|webp)$/i.test(fileName)) {
    return `./assets/textures/${fileName}`;
  }
  return url;
});

const loader = new FBXLoader(manager);
const objLoader = new OBJLoader(manager);
const textureLoader = new THREE.TextureLoader(manager);
const portalEmissionTexture = loadTexture("./assets/textures/T_PortalInside_Emission.png");
const portalOpacityTexture = loadTexture("./assets/textures/T_PortalInside_Opacity.png", false);
const islandTexture = loadTexture("./assets/island/island_diffuse.png");
const cloudTexture = loadTexture("./assets/island/cloud_texture1.png");
const treeBarkTexture = loadTexture("./assets/island/tree_bark.png");
const treeLeafTexture = loadTexture("./assets/island/tree_leaf.png");
const treeLeafOpacityTexture = loadTexture("./assets/island/tree_leaf_opacity.png", false);
const peachAlbedoTexture = loadTexture("./assets/peach/peach_albedo.jpg");
const peachNormalTexture = loadTexture("./assets/peach/peach_normal.png", false);
const peachRoughnessTexture = loadTexture("./assets/peach/peach_roughness.jpg", false);
const templeTextures = {
  stone: loadTexture("./assets/textures/MountainRock_D.tga.png"),
  snow: loadTexture("./assets/textures/Snow_D.tga.png"),
  snowRock: loadTexture("./assets/textures/SnowRockCombo_D.tga.png"),
  road: loadTexture("./assets/textures/Road_D.TGA.png"),
  sky: loadTexture("./assets/textures/Sky_D.tga.png"),
  grass: loadTexture("./assets/textures/GoundGrass_D.TGA.png"),
  groundStone: loadTexture("./assets/textures/GoundStone_D.TGA.png"),
  wall: loadTexture("./assets/textures/TempleWall_D.TGA.png"),
  baseWall: loadTexture("./assets/textures/TempleBaseWall_D.TGA.png"),
  wood: loadTexture("./assets/textures/Wood_D.tga.png"),
  roof: loadTexture("./assets/textures/Roof_D.TGA.png"),
  foliage: loadTexture("./assets/textures/FoliageandFlags_D.tga.png")
};

city = createProceduralCity();
cityRoot.add(city);
buildCityColliders(city);
loaded.city = true;
updateReadyState();

loader.load(
  "./assets/source/Portal.fbx",
  (object) => {
    preparePortal(object);
    portalRoot.add(object);

    portalMixer = new THREE.AnimationMixer(object);
    object.animations.forEach((clip) => {
      portalMixer.clipAction(clip).play();
    });

    loaded.portal = true;
    updateReadyState();
  },
  (event) => {
    if (event.total > 0 && !statusEl.dataset.ready) {
      const progress = Math.round((event.loaded / event.total) * 100);
      statusEl.textContent = `Loading portal ${progress}%`;
    }
  },
  (error) => {
    console.error(error);
    statusEl.textContent = "Could not load portal";
  }
);

createFloatingIslandScene();

objLoader.load(
  "./assets/island/cloud.obj",
  (object) => {
    prepareClouds(object);
    islandAssets.cloud = true;
    updateIslandReadyState();
  },
  undefined,
  (error) => {
    console.error(error);
    statusEl.textContent = "Could not load clouds";
  }
);

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

    loaded.man = true;
    updateReadyState();
  },
  (event) => {
    if (event.total > 0) {
      const progress = Math.round((event.loaded / event.total) * 100);
      statusEl.textContent = `Loading model ${progress}%`;
    }
  },
  (error) => {
    console.error(error);
    statusEl.textContent = "Could not load model";
  }
);

function updateReadyState() {
  if (!loaded.man || !loaded.city || !loaded.portal || !loaded.mountain) return;
  statusEl.textContent = "Ready";
  statusEl.dataset.ready = "true";
}

function updateIslandReadyState() {
  if (!islandAssets.island || !islandAssets.cloud) return;
  loaded.mountain = true;
  updateReadyState();
}

function normalizeModel(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          material.side = THREE.DoubleSide;
          material.needsUpdate = true;
        });
      }
    }
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

function prepareCity(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          material.roughness = Math.max(material.roughness ?? 0.6, 0.58);
          material.needsUpdate = true;
        });
      }
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const targetWidth = 92;
  const widestSide = Math.max(size.x, size.z, 0.001);
  object.scale.multiplyScalar(targetWidth / widestSide);

  const scaledBox = new THREE.Box3().setFromObject(object);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  object.position.x -= scaledCenter.x;
  object.position.z -= scaledCenter.z;
  object.position.y -= scaledBox.min.y;
  object.rotation.y = -Math.PI * 0.08;
}

function createProceduralCity() {
  const group = new THREE.Group();
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x30373d, roughness: 0.82 });
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x9da4a7, roughness: 0.78 });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0xaee5ff,
    emissive: 0x27485c,
    emissiveIntensity: 0.22,
    roughness: 0.35
  });
  const buildingMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x6f7d88, roughness: 0.68 }),
    new THREE.MeshStandardMaterial({ color: 0xa36f5d, roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: 0x7a8d75, roughness: 0.74 }),
    new THREE.MeshStandardMaterial({ color: 0x918474, roughness: 0.7 })
  ];

  for (let i = -2; i <= 2; i += 1) {
    const street = new THREE.Mesh(new THREE.BoxGeometry(54, 0.06, 3.2), roadMaterial);
    street.position.set(0, 0.04, i * 9);
    street.receiveShadow = true;
    group.add(street);

    const crossStreet = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 54), roadMaterial);
    crossStreet.position.set(i * 9, 0.045, 0);
    crossStreet.receiveShadow = true;
    group.add(crossStreet);
  }

  for (let x = -22; x <= 22; x += 6.5) {
    for (let z = -22; z <= 22; z += 6.5) {
      const nearStart = Math.hypot(x, z) < 5.8;
      const nearPortal = Math.hypot(x - portalTrigger.position.x, z - portalTrigger.position.z) < 5.6;
      const onRoad = Math.abs(x % 9) < 2.6 || Math.abs(z % 9) < 2.6;
      if (nearStart || nearPortal || onRoad) continue;

      const height = 2.2 + seededNoise(x, z) * 5.8;
      const width = 2.2 + seededNoise(z, x + 3) * 1.3;
      const depth = 2.1 + seededNoise(x - 2, z + 5) * 1.4;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        buildingMaterials[Math.floor(seededNoise(x + 11, z - 7) * buildingMaterials.length)]
      );
      building.position.set(x, height * 0.5, z);
      building.castShadow = true;
      building.receiveShadow = true;
      group.add(building);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.18, 0.12, depth + 0.18), sidewalkMaterial);
      cap.position.set(x, height + 0.07, z);
      cap.castShadow = true;
      group.add(cap);

      addWindowBands(group, x, z, width, depth, height, windowMaterial);
    }
  }

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.08, 40), sidewalkMaterial);
  plaza.position.set(portalTrigger.position.x, 0.07, portalTrigger.position.z);
  plaza.receiveShadow = true;
  group.add(plaza);

  return group;
}

function addWindowBands(group, x, z, width, depth, height, material) {
  const rows = Math.max(1, Math.floor(height / 1.15));
  for (let row = 1; row < rows; row += 1) {
    const y = row * 0.9 + 0.25;
    const front = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.13, 0.035), material);
    front.position.set(x, y, z + depth * 0.505);
    group.add(front);

    const side = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.13, depth * 0.7), material);
    side.position.set(x + width * 0.505, y, z);
    group.add(side);
  }
}

function seededNoise(x, z) {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function preparePortal(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          const materialName = (material.name || "").toLowerCase();
          material.transparent = true;
          material.side = THREE.DoubleSide;
          material.depthWrite = false;
          if (materialName.includes("inner") || materialName.includes("portal")) {
            material.map = portalEmissionTexture;
            material.emissive = new THREE.Color(0x7fd9ff);
            material.emissiveMap = portalEmissionTexture;
            material.emissiveIntensity = 2.4;
            material.alphaMap = portalOpacityTexture;
            material.opacity = 0.9;
          } else {
            material.emissive = new THREE.Color(0x213642);
            material.emissiveIntensity = 0.35;
          }
          material.needsUpdate = true;
        });
      }
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const targetHeight = 3.1;
  object.scale.multiplyScalar(targetHeight / Math.max(size.y, 0.001));

  const scaledBox = new THREE.Box3().setFromObject(object);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  object.position.x -= scaledCenter.x;
  object.position.z -= scaledCenter.z;
  object.position.y -= scaledBox.min.y;
  standPortalUpright(object);
  object.rotation.y = Math.PI * 0.15;
  settleObjectOnGround(object, -2.2);
  object.position.add(portalTrigger.position);
}

function prepareMountainScene(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          material.side = THREE.DoubleSide;
          material.map = getTempleTexture(material.name, child.name);
          material.roughness = Math.max(material.roughness ?? 0.72, 0.72);
          if ((material.name || "").toLowerCase().includes("foliage")) {
            material.transparent = true;
            material.alphaTest = 0.35;
            material.side = THREE.DoubleSide;
          }
          material.needsUpdate = true;
        });
      }
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const targetWidth = 38;
  object.scale.multiplyScalar(targetWidth / Math.max(size.x, size.z, 0.001));

  const scaledBox = new THREE.Box3().setFromObject(object);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  object.position.x -= scaledCenter.x;
  object.position.z -= scaledCenter.z;
  object.position.y -= scaledBox.min.y;
  object.rotation.y = Math.PI * 0.15;
}

function createFloatingIslandScene() {
  const island = new THREE.Group();
  const topMaterial = new THREE.MeshStandardMaterial({
    map: islandTexture,
    color: 0xa7d98b,
    roughness: 0.86
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d6a56,
    roughness: 0.92
  });
  const undersideMaterial = new THREE.MeshStandardMaterial({
    color: 0x5f5145,
    roughness: 0.96
  });

  const top = new THREE.Mesh(new THREE.CylinderGeometry(18, 16.2, 1.1, 48), topMaterial);
  top.position.y = -0.55;
  top.receiveShadow = true;
  top.castShadow = true;
  island.add(top);

  const underside = new THREE.Mesh(new THREE.ConeGeometry(14.8, 7.2, 48), undersideMaterial);
  underside.position.y = -4.7;
  underside.rotation.y = Math.PI / 48;
  underside.castShadow = true;
  island.add(underside);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(16.7, 0.34, 10, 64), sideMaterial);
  rim.position.y = 0.06;
  rim.rotation.x = Math.PI * 0.5;
  rim.castShadow = true;
  island.add(rim);

  const path = new THREE.Mesh(
    new THREE.RingGeometry(2.3, 10.6, 64, 1, Math.PI * 0.16, Math.PI * 1.28),
    new THREE.MeshStandardMaterial({ color: 0xcab88a, roughness: 0.88 })
  );
  path.rotation.x = -Math.PI * 0.5;
  path.position.y = 0.03;
  path.receiveShadow = true;
  island.add(path);

  mountainRoot.add(island);
  createAnimatedTrees();
  createPeaches();
  mountainColliders.length = 0;
  islandAssets.island = true;
  updateIslandReadyState();
}

function prepareClouds(object) {
  const material = new THREE.MeshStandardMaterial({
    map: cloudTexture,
    color: 0xffffff,
    roughness: 0.95,
    transparent: true,
    opacity: 0.86,
    depthWrite: false
  });

  object.traverse((child) => {
    if (child.isMesh) {
      child.material = material;
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });

  const cloudPositions = [
    [-10, 8.8, -7, 7.5],
    [7, 10.2, -10, 6.5],
    [2, 8.1, 9, 5.5],
    [-7, 9.4, 8, 6.2]
  ];

  cloudPositions.forEach(([x, y, z, scale], index) => {
    const cloud = object.clone(true);
    cloud.position.set(x, y, z);
    cloud.scale.setScalar(scale);
    cloud.rotation.y = index * 0.8;
    mountainRoot.add(cloud);
  });
}

function createAnimatedTrees() {
  const treePositions = [
    [-6.8, 0, -4.6, 0.92],
    [-3.6, 0, 5.4, 1.12],
    [5.5, 0, 4.5, 0.9],
    [7.6, 0, -2.5, 1.02],
    [0.8, 0, -7.2, 0.84]
  ];

  treePositions.forEach(([x, y, z, scale], index) => {
    const tree = createTree(scale);
    tree.position.set(x, y, z);
    tree.rotation.y = index * 1.7;
    tree.userData.phase = index * 0.83;
    animatedTrees.push(tree);
    mountainRoot.add(tree);
  });
}

function createTree(scale = 1) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.045, 2.05, 10),
    new THREE.MeshStandardMaterial({ map: treeBarkTexture, roughness: 0.82 })
  );
  trunk.position.y = 1.03;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const leafMaterial = new THREE.MeshStandardMaterial({
    map: treeLeafTexture,
    alphaMap: treeLeafOpacityTexture,
    transparent: true,
    alphaTest: 0.28,
    side: THREE.DoubleSide,
    roughness: 0.76
  });

  for (let i = 0; i < 7; i += 1) {
    const leaves = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.35), leafMaterial);
    leaves.position.set(0, 1.75 + i * 0.11, 0);
    leaves.rotation.y = (Math.PI / 5) * i;
    leaves.rotation.x = -0.28;
    leaves.castShadow = true;
    tree.add(leaves);
  }

  tree.scale.setScalar(scale);
  return tree;
}

function createPeaches() {
  const peachMaterial = new THREE.MeshStandardMaterial({
    map: peachAlbedoTexture,
    normalMap: peachNormalTexture,
    roughnessMap: peachRoughnessTexture,
    roughness: 0.72,
    color: 0xffd0a8
  });
  const peachGeometry = new THREE.SphereGeometry(0.18, 24, 18);
  const peachPositions = [
    [-2.2, 0.2, 3.2],
    [1.4, 0.2, -2.9],
    [4.8, 0.2, 2.1],
    [-5.4, 0.2, -1.4],
    [0.2, 0.2, 6.2]
  ];

  peachPositions.forEach((position, index) => {
    const peach = new THREE.Mesh(peachGeometry, peachMaterial);
    peach.position.set(...position);
    peach.scale.set(1, 0.92, 1);
    peach.castShadow = true;
    peach.userData.phase = index * 0.9;
    peaches.push(peach);
    mountainRoot.add(peach);
  });
}

function loadTexture(url, useColorSpace = true) {
  const texture = textureLoader.load(url);
  if (useColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function getTempleTexture(materialName = "", meshName = "") {
  const name = `${materialName} ${meshName}`.toLowerCase();
  if (name.includes("sky")) return templeTextures.sky;
  if (name.includes("road")) return templeTextures.road;
  if (name.includes("grass")) return templeTextures.grass;
  if (name.includes("gravel") || name.includes("ground")) return templeTextures.groundStone;
  if (name.includes("snowrock") || name.includes("rockmix")) return templeTextures.snowRock;
  if (name.includes("snow")) return templeTextures.snow;
  if (name.includes("stone") && name.includes("base")) return templeTextures.baseWall;
  if (name.includes("stone")) return templeTextures.stone;
  if (name.includes("wall")) return templeTextures.wall;
  if (name.includes("wood") || name.includes("door") || name.includes("pole")) return templeTextures.wood;
  if (name.includes("roof")) return templeTextures.roof;
  if (name.includes("foliage") || name.includes("flag") || name.includes("plane")) return templeTextures.foliage;
  if (name.includes("temple")) return templeTextures.wall;
  return templeTextures.grass;
}

function standPortalUpright(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (size.y < Math.max(size.x, size.z) * 0.55) {
    object.rotation.x = -Math.PI * 0.5;
    object.updateMatrixWorld(true);
    const uprightBox = new THREE.Box3().setFromObject(object);
    const uprightCenter = new THREE.Vector3();
    uprightBox.getCenter(uprightCenter);
    object.position.x -= uprightCenter.x;
    object.position.z -= uprightCenter.z;
    object.position.y -= uprightBox.min.y;
  }
}

function settleObjectOnGround(object, yOffset = 0) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  object.position.y += yOffset - box.min.y;
}

function buildCityColliders(object) {
  cityColliders.length = 0;
  object.updateMatrixWorld(true);

  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;

    const box = new THREE.Box3().setFromObject(child);
    const size = new THREE.Vector3();
    box.getSize(size);

    const isTallEnough = size.y > 0.42 && box.max.y > 0.48;
    const isWorthBlocking = Math.max(size.x, size.z) > 0.18;
    const isWholeMap = size.x > 42 && size.z > 42;
    const isRoadLikeSlab = size.y < 0.8 && Math.max(size.x, size.z) > 18;

    if (isTallEnough && isWorthBlocking && !isWholeMap && !isRoadLikeSlab) {
      cityColliders.push(box.clone().expandByScalar(0.08));
    }
  });
}

function makeCheckerTexture() {
  const size = 512;
  const squares = 8;
  const squareSize = size / squares;
  const checkerCanvas = document.createElement("canvas");
  checkerCanvas.width = size;
  checkerCanvas.height = size;
  const ctx = checkerCanvas.getContext("2d");

  for (let y = 0; y < squares; y += 1) {
    for (let x = 0; x < squares; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#e8e1d2" : "#1f2830";
      ctx.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
    }
  }

  ctx.strokeStyle = "rgba(240, 179, 90, 0.24)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= squares; i += 1) {
    const p = i * squareSize;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  return new THREE.CanvasTexture(checkerCanvas);
}

function animate() {
  const delta = clock.getDelta();
  const isMoving = updateMovement(delta);
  updateJump(delta);
  updateIslandAnimations(delta);

  if (mixer) mixer.update(delta);
  if (portalMixer && portalRoot.visible) portalMixer.update(delta);
  if (walkAction) {
    walkAction.timeScale = isMoving ? walkCycleSpeed * getRunMultiplier() : 0;
  }

  checkPortalEntry();
  checkPeachPickups();
  updatePeachGuideArrow();
  updateCamera(delta);
  controls.update();
  renderer.render(scene, camera);
}

function updateMovement(delta) {
  if (!man || isWorldTransitioning) return false;

  moveDirection.set(0, 0, 0);

  const isTurningLeft = keys.has("a") || keys.has("arrowleft");
  const isTurningRight = keys.has("d") || keys.has("arrowright");
  const isForwardPressed = keys.has("w") || keys.has("arrowup");

  if (isTurningLeft) track.rotation.y += delta * 2.4;
  if (isTurningRight) track.rotation.y -= delta * 2.4;

  movementForward.set(Math.cos(track.rotation.y), 0, -Math.sin(track.rotation.y)).normalize();
  if (isForwardPressed || isTurningLeft || isTurningRight) moveDirection.copy(movementForward);

  if (moveDirection.lengthSq() > 0.001) {
    mouseControl.active = false;
  } else if (mouseControl.active && mouseControl.pointerDown) {
    mouseDirection.copy(mouseControl.target).sub(track.position);
    mouseDirection.y = 0;
    if (mouseDirection.lengthSq() > 0.01) {
      moveDirection.copy(mouseDirection);
    } else {
      mouseControl.active = false;
    }
  }

  if (moveDirection.lengthSq() < 0.001) return false;

  moveDirection.normalize();
  movePlayer(moveDirection, delta * (1.7 + strideSpeed * 1.5) * getRunMultiplier());

  const facing = Math.atan2(-moveDirection.z, moveDirection.x);
  let deltaAngle = facing - track.rotation.y;
  deltaAngle = Math.atan2(Math.sin(deltaAngle), Math.cos(deltaAngle));
  track.rotation.y += deltaAngle * Math.min(1, delta * 12);
  return true;
}

function getRunMultiplier() {
  return keys.has("shift") ? runMultiplier : 1;
}

function updateJump(delta) {
  if (jumpOffset <= 0 && verticalVelocity <= 0) {
    jumpOffset = 0;
    verticalVelocity = 0;
    track.position.y = 0;
    return;
  }

  verticalVelocity -= jumpSettings.gravity * delta;
  jumpOffset = Math.max(0, jumpOffset + verticalVelocity * delta);
  if (jumpOffset === 0) verticalVelocity = 0;
  track.position.y = jumpOffset;
}

function updateIslandAnimations(delta) {
  if (!mountainRoot.visible) return;
  const time = clock.elapsedTime;

  animatedTrees.forEach((tree) => {
    const sway = Math.sin(time * 1.6 + tree.userData.phase) * 0.045;
    tree.rotation.z = sway;
  });

  peaches.forEach((peach) => {
    if (!peach.visible) return;
    peach.rotation.y += delta * 1.4;
    peach.position.y = 0.2 + Math.sin(time * 2 + peach.userData.phase) * 0.035;
  });
}

function setMouseTarget(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  if (raycaster.ray.intersectPlane(groundPlane, groundTarget)) {
    mouseControl.target.copy(groundTarget);
    mouseControl.active = mouseControl.pointerDown;
  }
}

function movePlayer(direction, distance) {
  candidatePosition.copy(track.position).addScaledVector(direction, distance);

  if (canStandAt(candidatePosition)) {
    track.position.copy(candidatePosition);
  } else {
    xSlidePosition.copy(track.position);
    xSlidePosition.x = candidatePosition.x;
    zSlidePosition.copy(track.position);
    zSlidePosition.z = candidatePosition.z;

    if (canStandAt(xSlidePosition)) {
      track.position.copy(xSlidePosition);
    } else if (canStandAt(zSlidePosition)) {
      track.position.copy(zSlidePosition);
    }
  }

  const distanceFromCenter = Math.hypot(track.position.x, track.position.z);
  const boundsRadius = worldSettings[activeWorld].boundsRadius;
  if (distanceFromCenter > boundsRadius) {
    track.position.x *= boundsRadius / distanceFromCenter;
    track.position.z *= boundsRadius / distanceFromCenter;
  }
}

function canStandAt(position) {
  if (Math.hypot(position.x, position.z) > worldSettings[activeWorld].boundsRadius + 0.1) return false;

  for (const box of activeColliders) {
    if (position.y + playerCollider.height < box.min.y || position.y > box.max.y) continue;
    const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
    const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
    const dx = position.x - closestX;
    const dz = position.z - closestZ;
    if (dx * dx + dz * dz < playerCollider.radius * playerCollider.radius) return false;
  }

  return true;
}

function checkPortalEntry() {
  if (activeWorld !== "city" || isWorldTransitioning || !loaded.mountain) return;
  const dx = track.position.x - portalTrigger.position.x;
  const dz = track.position.z - portalTrigger.position.z;
  if (dx * dx + dz * dz < portalTrigger.radius * portalTrigger.radius) {
    startWorldTransition();
  }
}

function startWorldTransition() {
  isWorldTransitioning = true;
  keys.clear();
  mouseControl.active = false;
  mouseControl.pointerDown = false;
  showLoadingScreen();

  let progress = 0;
  const startedAt = performance.now();
  const durationMs = 1150;

  const tick = () => {
    const elapsed = performance.now() - startedAt;
    progress = Math.min(1, elapsed / durationMs);
    setLoadingProgress(progress);

    if (progress < 1) {
      window.requestAnimationFrame(tick);
    } else {
      enterMountainScene();
      window.setTimeout(hideLoadingScreen, 180);
    }
  };

  tick();
}

function enterMountainScene() {
  activeWorld = "mountain";
  isWorldTransitioning = false;
  activeColliders = mountainColliders;
  keys.clear();
  mouseControl.active = false;
  mouseControl.pointerDown = false;

  cityRoot.visible = false;
  portalRoot.visible = false;
  mountainRoot.visible = true;
  ground.visible = false;

  scene.background.copy(worldSettings.mountain.background);
  scene.fog = worldSettings.mountain.fog;

  track.position.set(0, 0, 5.5);
  track.rotation.y = -Math.PI * 0.5;
  camera.position.set(4.8, 3.6, 10.5);
  controls.target.set(0, 0.96, 4.3);

  statusEl.textContent = "Island";
  statusEl.dataset.ready = "true";
}

function showLoadingScreen() {
  setLoadingProgress(0);
  loadingScreen.dataset.visible = "true";
}

function hideLoadingScreen() {
  loadingScreen.dataset.visible = "false";
}

function setLoadingProgress(progress) {
  loadingProgress.style.width = `${Math.round(progress * 100)}%`;
}

function checkPeachPickups() {
  if (activeWorld !== "mountain") return;

  peaches.forEach((peach) => {
    if (!peach.visible) return;
    const dx = track.position.x - peach.position.x;
    const dz = track.position.z - peach.position.z;
    if (dx * dx + dz * dz < 0.75 * 0.75) {
      peach.visible = false;
      pickedPeaches += 1;
      showPickupMessage();
    }
  });
}

function showPickupMessage() {
  statusEl.textContent = `Peach picked up ${pickedPeaches}/${peaches.length}`;
  statusEl.dataset.ready = "false";
  window.clearTimeout(pickupMessageTimer);
  pickupMessageTimer = window.setTimeout(() => {
    statusEl.dataset.ready = "true";
  }, 1400);
}

function updatePeachGuideArrow() {
  if (activeWorld !== "mountain" || isWorldTransitioning) {
    peachArrow.visible = false;
    return;
  }

  let nearest = null;
  let nearestDistance = Infinity;
  peaches.forEach((peach) => {
    if (!peach.visible) return;
    const dx = peach.position.x - track.position.x;
    const dz = peach.position.z - track.position.z;
    const distance = dx * dx + dz * dz;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = peach;
    }
  });

  if (!nearest) {
    peachArrow.visible = false;
    return;
  }

  const direction = new THREE.Vector3(
    nearest.position.x - track.position.x,
    0,
    nearest.position.z - track.position.z
  ).normalize();

  peachArrow.position.set(track.position.x, track.position.y + 2.25, track.position.z);
  peachArrow.setDirection(direction);
  peachArrow.visible = true;
}

function updateCamera(delta) {
  manForward.set(Math.cos(track.rotation.y), 0, -Math.sin(track.rotation.y)).normalize();
  cameraRight.crossVectors(manForward, worldUp).normalize();
  cameraSideOffset.copy(cameraRight).multiplyScalar(followCamera.shoulder);

  cameraLookTarget.copy(track.position).addScaledVector(manForward, 1.15);
  cameraLookTarget.y += 0.96;
  placeCameraBehindPlayer();

  camera.position.lerp(desiredCameraPosition, Math.min(1, delta * 7.5));
  controls.target.lerp(cameraLookTarget, Math.min(1, delta * 9));
}

function placeCameraBehindPlayer() {
  for (let distance = followCamera.distance; distance >= followCamera.minDistance; distance -= 0.45) {
    cameraTestPosition
      .copy(track.position)
      .addScaledVector(manForward, -distance)
      .add(cameraSideOffset);
    cameraTestPosition.y = track.position.y + followCamera.height;

    if (!isCameraInsideBuilding(cameraTestPosition)) {
      desiredCameraPosition.copy(cameraTestPosition);
      return;
    }
  }

  desiredCameraPosition
    .copy(track.position)
    .addScaledVector(manForward, -followCamera.minDistance)
    .add(cameraSideOffset);
  desiredCameraPosition.y = track.position.y + followCamera.height + 0.6;
}

function isCameraInsideBuilding(position) {
  for (const box of activeColliders) {
    if (position.y < box.min.y || position.y > box.max.y) continue;
    if (
      position.x > box.min.x - 0.22 &&
      position.x < box.max.x + 0.22 &&
      position.z > box.min.z - 0.22 &&
      position.z < box.max.z + 0.22
    ) {
      return true;
    }
  }

  return false;
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
