import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { calculateSurvival as scoreSurvival, recordImpact, resetRunData } from './systems/survival.js';
import { hashSeed, getDailySeed, getDailySeedDateString } from './systems/trackSeed.js';
import { modeConfigs } from './modes/config.js';
import {
  scheduleAudioInit,
  unlockAudioPlayback,
  updateEngineAudio,
  stopEngineForMenu,
  startBackgroundMusic,
  playSfx
} from './systems/audio.js';
import { STORAGE, ROAD_HALF_WIDTH, PLAYABLE_HALF_WIDTH, SCENERY_WRAP_DISTANCE } from './constants.js';
import { createWorld } from './physics.js';
import { createSceneCameraRenderer, resizeRenderer } from './rendererBootstrap.js';
import { createScenery } from './scenery.js';
import { spawnRoad, resetRoadSegments, updateRoadStream, applyRoadNightVisuals } from './track.js';
import { makeCarMesh, createCarBody } from './cars/carBase.js';
import { carConfigs, isRickshawUnlocked, markRunCompletedOnce } from './cars/index.js';
import { spawnObstaclesForMode } from './obstacles/spawnByMode.js';
import { updateBridgeCollapse, syncBridgeMesh } from './obstacles/bridge.js';
import { disposeObject3D } from './obstacles/dispose.js';
import { drawHUD } from './ui/hud.js';
import { buildPicker } from './ui/carPicker.js';
import { showResultsPanel, formatShareText, persistScores } from './ui/results.js';
import { applyCarGltfIfConfigured } from './systems/carGltf.js';
import {
  parsePortalParams,
  spawnExitPortal,
  spawnEntryPortal,
  updatePortalAnimations,
  isCarInPortal,
  triggerExitPortalRedirect,
  triggerEntryPortalRedirect,
  exitPortalHandle,
  entryPortalHandle
} from './systems/portals.js';
import { createDynamicSky } from './systems/dynamicSky.js';
import {
  attachCarHeadlights,
  updateHeadlightIntensity
} from './systems/carHeadlights.js';
import './styles.css';

/** Snapshot of URL continuity params (read once per page load). */
const PORTAL_BOOTSTRAP = parsePortalParams();

let pendingPortalForwardSpeed = /** @type {number | null} */ (null);

const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('#game'));
const hudCanvas = /** @type {HTMLCanvasElement} */ (document.querySelector('#hud'));
const ctx = /** @type {CanvasRenderingContext2D} */ (hudCanvas.getContext('2d'));
const menu = /** @type {HTMLElement} */ (document.querySelector('#menu'));
const results = /** @type {HTMLElement} */ (document.querySelector('#results'));
const flash = /** @type {HTMLElement} */ (document.querySelector('#flash'));
const toast = /** @type {HTMLElement} */ (document.querySelector('#toast'));
const carWrap = /** @type {HTMLElement} */ (document.querySelector('#cars'));
const modeWrap = /** @type {HTMLElement} */ (document.querySelector('#modes'));

/** Menu/results must receive clicks above the WebGL canvas (often composited on top otherwise). */
function syncGameCanvasPointerBlocking() {
  if (!canvas || !menu || !results) return;
  const uiBlocking =
    menu.classList.contains('is-visible') || results.classList.contains('is-visible');
  canvas.style.pointerEvents = uiBlocking ? 'none' : 'auto';
}

const keys = new Set();

let runData = resetRunData();

const state = {
  selectedCar: 'sports',
  selectedMode: 'shock',
  phase: 'menu',
  damage: 0,
  distance: 0,
  time: 0,
  highScore: Number(localStorage.getItem(STORAGE.bestDistance) || 0),
  shockTimer: 8,
  nextShockAt: 8,
  lastGrounded: true,
  shake: 0,
  flashText: '',
  flashTTL: 0,
  tiltEnabled: false,
  fogTTL: 0,
  windTTL: 0,
  windDirection: 0,
  frictionTTL: 0,
  frictionGrip: 1,
  curseLabel: '',
  repairs: 0,
  /** Incoming player tag from portal (optional). */
  portalUsername: '',
  /** Time since last portal spawn */
  portalTimer: 0,
  /** HUD: eased speed (km/h) and shock vignette alpha for readable motion. */
  hudSpeedDisplay: 0,
  hudShockPulse: 0
};

const finishState = { won: false, reason: 'Ready' };
const physicsStats = {
  grounded: false,
  activeContacts: 0,
  lastImpactLabel: '',
  lastImpactAt: 0,
  lastShoulderAt: -99
};

let scene;
let camera;
let renderer;
/** @type {ReturnType<typeof createDynamicSky> | null} */
let dynamicSky = null;
let world;
let car;
let carGltfSpawnToken = 0;
let fixedStepAccumulator = 0;
let lastTime = performance.now();
const cameraLookTarget = new THREE.Vector3();

/** Tinyskies-style steering ease — raw keys feed `steerSmoothed` on {@link car}. */
const STEER_INPUT_SMOOTH = 10;
const _scratchEuler = new CANNON.Vec3();
const _scratchEulerLanding = new CANNON.Vec3();
const _flatQuat = new CANNON.Quaternion();
const _qMeshPrev = new THREE.Quaternion();
const _qMeshCurr = new THREE.Quaternion();
const _damageColorDeep = new THREE.Color(0x2b0907);
const _scratchBodyColor = new THREE.Color();

const _triggerPos = new THREE.Vector3();

/** Interpolated mesh position — use for hazard/trigger tests the player sees ([`car.mesh`] after [`syncCarMesh`]). */
function copyPresentationPosition(out) {
  if (car?.mesh) return out.copy(car.mesh.position);
  return out.set(car.body.position.x, car.body.position.y, car.body.position.z);
}

// ── Camera rig: spring-damper follow + smoothed framing (no per-frame Vector3 churn in hot path) ──
const CAM_STIFFNESS_RUN = 28;
const CAM_STIFFNESS_IDLE = 88;
const CAM_STIFFNESS_LOOK = 22;
const CAM_SPEED_NORM_SMOOTH = 7;
const CAM_STEER_LEAD_SMOOTH = 9;
const CAM_STEER_LEAD_GAIN = 0.42;
const CAM_IDLE_ENTER_SEC = 0.14;
const CAM_IDLE_BLEND_SMOOTH = 10;
const CAM_SHAKE_DECAY_PER_S = 0.03;
const CAM_SHAKE_IMPACT_HI = 1;
const CAM_SHAKE_RUMBLE_MUL = 0.55;
const CAM_SHOCK_RUMBLE = 0.18;
const CAM_FOV_SMOOTH = 6;
const CAM_FOV_BASE = 58;
const CAM_FOV_SPEED_MUL = 24;
const CAM_FOV_SHOCK_ADD = 12;
const CAM_FOV_MAX_NORMAL = 88;
const CAM_FOV_MAX_SHOCK = 96;
const CAM_MENU_STIFFNESS = 18;
const _camTarget = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _menuCamTarget = new THREE.Vector3(0, 4.8, -8.5);
const _menuCamLook = new THREE.Vector3(0, 0.7, 2);

/** Persistent camera rig (critically damped springs on pos + look). */
const cameraRig = {
  ready: false,
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  lookPos: new THREE.Vector3(),
  lookVel: new THREE.Vector3(),
  speedNorm: 0,
  steerLead: 0,
  /** 0 = dynamic follow, 1 = stable idle (after hold). */
  stableIdleBlend: 0,
  idleHoldT: 0,
  fovSmoothed: CAM_FOV_BASE
};

function camCriticalDamping(stiffness) {
  return 2 * Math.sqrt(Math.max(0.001, stiffness));
}

/**
 * Critically damped spring toward `target` (stable, no overshoot).
 * @param {THREE.Vector3} pos
 * @param {THREE.Vector3} vel
 * @param {THREE.Vector3} target
 */
function springDamperVector3(pos, vel, target, dt, stiffness) {
  const d = camCriticalDamping(stiffness);
  const ax = stiffness * (target.x - pos.x) - d * vel.x;
  const ay = stiffness * (target.y - pos.y) - d * vel.y;
  const az = stiffness * (target.z - pos.z) - d * vel.z;
  vel.x += ax * dt;
  vel.y += ay * dt;
  vel.z += az * dt;
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;
}

function initCameraRig() {
  if (!camera) return;
  cameraRig.ready = true;
  cameraRig.pos.copy(camera.position);
  cameraRig.vel.set(0, 0, 0);
  cameraRig.lookPos.copy(_menuCamLook);
  cameraRig.lookVel.set(0, 0, 0);
  cameraRig.speedNorm = 0;
  cameraRig.steerLead = 0;
  cameraRig.stableIdleBlend = 0;
  cameraRig.idleHoldT = 0;
  cameraRig.fovSmoothed = camera.fov;
  cameraLookTarget.copy(cameraRig.lookPos);
}

/** Call when a new run starts so the rig doesn’t snap from menu/preview pose. */
function resetCameraRigForRunStart() {
  if (!camera || !cameraRig.ready) return;
  cameraRig.pos.copy(camera.position);
  cameraRig.vel.set(0, 0, 0);
  cameraRig.lookPos.copy(cameraLookTarget);
  cameraRig.lookVel.set(0, 0, 0);
  cameraRig.idleHoldT = 0;
  cameraRig.stableIdleBlend = 0;
}

const FIXED_DELTA = 1 / 60;
const MAX_FRAME_DELTA = 0.1;
const MAX_PHYSICS_SUBSTEPS = 6;
const MAX_STEP_DISPLACEMENT = 2.15;
const roadSegments = [];
const obstacles = [];
const trees = [];
const obstacleBodies = new Map();

let deviceGamma = 0;

/** Map loose color hints from other games onto our car presets. */
function mapPortalColorToCarId(colorRaw, rickshawOk) {
  const c = (colorRaw || '').toLowerCase().trim();
  if (/(green|lime|mint)/i.test(c) || c === '#57c785') return 'suv';
  if (/(blue|azure|steel)/i.test(c) || c === '#4e8df5') return 'sports';
  if (/(yellow|orange|gold|amber)/i.test(c)) return rickshawOk ? 'rickshaw' : 'sports';
  if (/truck|brown|taupe/.test(c) || c === '#8b7c6a') return 'truck';
  if (/(red|crimson|ruby)/i.test(c)) return 'hatchback';
  if (/(white|silver|grey|gray)/i.test(c)) return 'suv';
  return 'sports';
}

function applyPortalBootstrap() {
  if (!PORTAL_BOOTSTRAP?.isPortal) return;
  const p = PORTAL_BOOTSTRAP;
  state.portalUsername = p.username || '';
  const rOk = isRickshawUnlocked();
  state.selectedCar = mapPortalColorToCarId(p.color, rOk);

  const v = Number.parseFloat(p.speed);
  if (Number.isFinite(v) && v > 2) pendingPortalForwardSpeed = Math.min(Math.max(v, 0), 120);
}

function getObstacleCtx() {
  return { scene, world, obstacles, obstacleBodies, roadSegments };
}

function resolveObstacleSeed(modeKey, selectedCar) {
  const mode = modeConfigs[modeKey];
  if (mode.seedKey === 'daily') return getDailySeed();
  return hashSeed(`${modeKey}:${selectedCar}:${Date.now()}`);
}

function init() {
  if (!canvas) {
    console.error('[Cursed Road] Missing canvas #game');
    return;
  }
  if (PORTAL_BOOTSTRAP.isPortal) {
    applyPortalBootstrap();
    menu?.classList.remove('is-visible');
    results?.classList.remove('is-visible');
    state.phase = 'running';
  }
  refreshPicker();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const boot = createSceneCameraRenderer(canvas, w, h);
  scene = boot.scene;
  camera = boot.camera;
  renderer = boot.renderer;
  initCameraRig();
  world = createWorld();
  const hemi = new THREE.HemisphereLight(0x87CEEB, 0x4a7c3a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(-8, 15, -6);
  scene.add(sun.target);
  scene.add(sun);
  if (scene.fog && camera) {
    dynamicSky = createDynamicSky(scene, camera, { hemi, sun, fog: scene.fog });
  }
  createScenery(scene, world, trees, obstacleBodies);
  spawnRoad(scene, world, roadSegments);
  spawnExitPortal(scene);
  if (PORTAL_BOOTSTRAP.isPortal && PORTAL_BOOTSTRAP.ref) {
    spawnEntryPortal(scene);
  }
  wireEvents();
  resize();
  scheduleAudioInit(6000);
  syncGameCanvasPointerBlocking();
  if (PORTAL_BOOTSTRAP.isPortal) {
    unlockAudioPlayback();
    startBackgroundMusic();
    resetRun();
  } else {
    spawnCar();
  }
}

function spawnCar() {
  if (car) {
    scene.remove(car.mesh);
    world.removeBody(car.body);
  }
  const config = carConfigs[state.selectedCar];
  const body = createCarBody(config);
  world.addBody(body);
  const mesh = makeCarMesh(config);
  scene.add(mesh);
  car = {
    body,
    mesh,
    config,
    grounded: true,
    oilTTL: 0,
    shockTTL: 0,
    yaw: 0,
    forwardSpeed: 0,
    steerSmoothed: 0
  };
  attachCarHeadlights(car);
  car.body.velocity.set(0, 0, 0);
  car.body.angularVelocity.set(0, 0, 0);
  initCarRenderState();
  const gltfToken = (carGltfSpawnToken += 1);
  const carIdForGltf = state.selectedCar;
  queueMicrotask(async () => {
    if (gltfToken !== carGltfSpawnToken || !car) return;
    await applyCarGltfIfConfigured(carIdForGltf, car, carConfigs);
  });
}

function resetRun() {
  unlockAudioPlayback();
  startBackgroundMusic();
  clearObstacles();
  resetRoadSegments(roadSegments, world);
  resetTrees();
  spawnCar();
  
  // Hard reset car position and velocity to eliminate any idle animation residue
  if (car) {
    const rideHeight = car.config.scale[1] / 2 + 0.16;
    car.body.position.set(0, rideHeight, 1);
    car.body.quaternion.setFromEuler(0, 0, 0);
    car.body.velocity.set(0, 0, 0);
    car.body.angularVelocity.set(0, 0, 0);
    car.yaw = 0;
    car.forwardSpeed = 0;
    car.steerSmoothed = 0;

    // Sync render state immediately to prevent interpolation flicker
    initCarRenderState();
    syncCarMesh(1);
  }
  
  const boost = pendingPortalForwardSpeed;
  if (boost != null && car) {
    car.forwardSpeed = THREE.MathUtils.clamp(boost * 1.03, 0, Math.max(car.config.speed * 2.9, boost));
    pendingPortalForwardSpeed = null;
  }
  resetCameraRigForRunStart();
  fixedStepAccumulator = 0;
  state.phase = 'running';
  state.damage = 0;
  state.distance = 0;
  state.time = 0;
  state.shockTimer = 8;
  state.nextShockAt = state.selectedMode === 'shock' ? 4.5 : 10 + Math.random() * 8;
  state.flashText = '';
  state.flashTTL = 0;
  state.fogTTL = 0;
  state.windTTL = 0;
  state.windDirection = 0;
  state.frictionTTL = 0;
  state.frictionGrip = 1;
  state.curseLabel = '';
  state.portalTimer = 0;
  state.repairs = 0;
  state.hudSpeedDisplay = 0;
  state.hudShockPulse = 0;
  flash.textContent = '';
  flash.classList.remove('is-visible');
  finishState.won = false;
  finishState.reason = 'Running';
  physicsStats.grounded = false;
  physicsStats.activeContacts = 0;
  physicsStats.lastShoulderAt = -99;
  physicsStats.lastImpactAt = 0;
  physicsStats.lastImpactLabel = '';
  runData = resetRunData();
  const seed = resolveObstacleSeed(state.selectedMode, state.selectedCar);
  spawnObstaclesForMode(getObstacleCtx(), state.selectedMode, seed);
  menu.classList.remove('is-visible');
  results.classList.remove('is-visible');
  syncGameCanvasPointerBlocking();
}

function getCarSpeedKmh() {
  if (!car) return 0;
  const horizontalSpeed = Math.hypot(car.body.velocity.x, car.body.velocity.z);
  const rawKmh = horizontalSpeed * 3.6;
  if (
    physicsStats.grounded &&
    Math.abs(car.forwardSpeed) < 0.35 &&
    rawKmh < 4 &&
    car.shockTTL <= 0 &&
    car.oilTTL <= 0 &&
    state.windTTL <= 0
  ) {
    return 0;
  }
  return rawKmh;
}

function clearObstacles() {
  for (const obstacle of obstacles) {
    disposeObject3D(obstacle.mesh);
    if (obstacle.voidMesh) disposeObject3D(obstacle.voidMesh);
    scene.remove(obstacle.mesh);
    if (obstacle.voidMesh) scene.remove(obstacle.voidMesh);
    if (obstacle.body) {
      obstacleBodies.delete(obstacle.body.id);
      world.removeBody(obstacle.body);
    }
  }
  obstacles.length = 0;
}

function resetTrees() {
  for (const t of trees) {
    const originalZ = t.trunk.userData.originalZ || t.trunk.position.z;
    if (!t.trunk.userData.originalZ) {
      t.trunk.userData.originalZ = originalZ;
      t.top.userData.originalZ = t.top.position.z;
    }
    t.trunk.position.z = t.trunk.userData.originalZ;
    t.top.position.z = t.top.userData.originalZ;
    t.body.position.z = t.trunk.userData.originalZ;
  }
}

function refreshPicker() {
  if (state.selectedCar === 'rickshaw' && !isRickshawUnlocked()) state.selectedCar = 'sports';
  buildPicker({
    carWrap,
    modeWrap,
    carConfigs,
    modeConfigs,
    state,
    rickshawUnlocked: isRickshawUnlocked(),
    onCar: (id) => {
      if (carConfigs[id].lockedUntilFirstRun && !isRickshawUnlocked()) return;
      state.selectedCar = id;
      spawnCar();
      refreshPicker();
    },
    onMode: (id) => {
      state.selectedMode = id;
      refreshPicker();
      /* Match menu copy (“tap a mode to play”). Car selection stays explicit for Start-only. */
      if (state.phase === 'menu') resetRun();
    }
  });
  syncGameCanvasPointerBlocking();
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  resizeRenderer(renderer, camera, width, height);
  hudCanvas.width = Math.floor(width * Math.min(window.devicePixelRatio, 1.5));
  hudCanvas.height = Math.floor(height * Math.min(window.devicePixelRatio, 1.5));
  hudCanvas.style.width = `${width}px`;
  hudCanvas.style.height = `${height}px`;
  ctx.setTransform(hudCanvas.width / width, 0, 0, hudCanvas.height / height, 0, 0);
}

function wireEvents() {
  window.addEventListener('resize', resize);
  const userAudioUnlock = () => unlockAudioPlayback();
  window.addEventListener('keydown', userAudioUnlock, { once: true });
  window.addEventListener('pointerdown', userAudioUnlock, { once: true });

  window.addEventListener('keydown', (event) => {
    keys.add(event.key.toLowerCase());
    if (event.key === 'Enter' && state.phase !== 'running') resetRun();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

  window.addEventListener(
    'deviceorientation',
    (e) => {
      if (e.gamma != null) deviceGamma = e.gamma;
    },
    true
  );

  document.querySelector('#start')?.addEventListener('click', resetRun);
  document.querySelector('#again')?.addEventListener('click', resetRun);
  document.querySelector('#share')?.addEventListener('click', shareResult);
  document.querySelector('#tilt-perm')?.addEventListener('click', requestTiltPermission);
}

async function requestTiltPermission() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      const res = await DeviceOrientationEvent.requestPermission();
      state.tiltEnabled = res === 'granted';
    } else {
      state.tiltEnabled = true;
    }
    showToast(state.tiltEnabled ? 'Tilt steering on' : 'Tilt not available');
  } catch {
    state.tiltEnabled = false;
    showToast('Tilt permission denied');
  }
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_DELTA);
  lastTime = now;
  if (!renderer || !scene || !camera || !car) {
    requestAnimationFrame(loop);
    return;
  }
  dynamicSky?.update(dt);
  updatePortalAnimations(now);
  if (state.phase === 'running') updateGame(dt);
  else {
    idlePreview(dt);
    stopEngineForMenu();
  }
  updateCamera(dt);
  if (car && state.phase === 'running') {
    const tgtKmh = getCarSpeedKmh();
    state.hudSpeedDisplay += (tgtKmh - state.hudSpeedDisplay) * (1 - Math.exp(-14 * dt));
    const shockTarget = car.shockTTL > 0 ? Math.min(0.55, car.shockTTL / 4.2) : 0;
    state.hudShockPulse += (shockTarget - state.hudShockPulse) * (1 - Math.exp(-12 * dt));
  } else if (car) {
    state.hudSpeedDisplay = getCarSpeedKmh();
    state.hudShockPulse = 0;
  }
  renderer.render(scene, camera);
  drawHUD(window.innerWidth, window.innerHeight, {
    ctx,
    state,
    car,
    modes: modeConfigs,
    phase: state.phase
  });
  const kmh = car ? Math.round(getCarSpeedKmh()) : 0;
  if (car) updateEngineAudio(kmh, state.phase);
  requestAnimationFrame(loop);
}

function fixedPhysics(dt) {
  fixedStepAccumulator += dt;
  let substeps = 0;
  while (fixedStepAccumulator >= FIXED_DELTA && substeps < MAX_PHYSICS_SUBSTEPS) {
    runFixedPhysicsStep(FIXED_DELTA);
    fixedStepAccumulator -= FIXED_DELTA;
    substeps += 1;
  }
  if (substeps === MAX_PHYSICS_SUBSTEPS && fixedStepAccumulator >= FIXED_DELTA) {
    fixedStepAccumulator = fixedStepAccumulator % FIXED_DELTA;
  }
  return THREE.MathUtils.clamp(fixedStepAccumulator / FIXED_DELTA, 0, 1);
}

function updateGame(dt) {
  state.time += dt;
  runData.timeAlive = state.time;
  updateCurseTimers(dt);
  const alpha = fixedPhysics(dt);
  syncCarMesh(alpha);
  checkObstacleTriggers(dt);
  updateMovingHazards(dt);
  updateHazardVisuals(dt);
  handlePortals();
  updateRunState(dt);
}

function updateCurseTimers(dt) {
  state.fogTTL = Math.max(0, state.fogTTL - dt);
  state.windTTL = Math.max(0, state.windTTL - dt);
  state.frictionTTL = Math.max(0, state.frictionTTL - dt);
  if (state.frictionTTL <= 0) state.frictionGrip = 1;
  if (state.windTTL <= 0) state.windDirection = 0;
  if (state.fogTTL <= 0 && state.windTTL <= 0 && state.frictionTTL <= 0) state.curseLabel = '';
}

function updateMovingHazards(dt) {
  if (!car) return;
  copyPresentationPosition(_triggerPos);
  const pz = _triggerPos.z;
  const px = _triggerPos.x;
  for (const obstacle of obstacles) {
    if (obstacle.kind !== 'traffic' || obstacle.used) continue;
    const ahead = obstacle.mesh.position.z - pz;
    if (ahead > 180) continue;
    obstacle.mesh.position.z -= (obstacle.speed || 42) * dt;
    if (ahead < -45) {
      obstacle.used = true;
      obstacle.mesh.visible = false;
      continue;
    }
    const dx = Math.abs(px - obstacle.mesh.position.x);
    const dz = Math.abs(pz - obstacle.mesh.position.z);
    if (dz < 58 && !obstacle.warned) {
      obstacle.warned = true;
      state.curseLabel = obstacle.mesh.position.x < 0 ? 'ONCOMING LEFT' : 'ONCOMING RIGHT';
      flashMessage(state.curseLabel);
    }
    if (dx < 1.75 && dz < 3.1) {
      obstacle.used = true;
      obstacle.mesh.visible = false;
      car.forwardSpeed *= 0.18;
      car.body.velocity.x += Math.sign(px - obstacle.mesh.position.x || 1) * 12;
      state.shake = Math.max(state.shake, 1.9);
      addDamage(obstacle.hitDamage || 42, 'HEAD-ON');
      playSfx('crash');
    }
  }
}

function updateHazardVisuals(dt) {
  const t = state.time;
  for (const obstacle of obstacles) {
    if (!obstacle.mesh) continue;
    if (obstacle.kind === 'gravity') {
      obstacle.mesh.rotation.y += dt * 2.4;
      obstacle.mesh.scale.setScalar(1 + Math.sin(t * 6 + obstacle.mesh.position.z) * 0.055);
    } else if (obstacle.kind === 'wind') {
      obstacle.mesh.position.x = Math.sin(t * 5 + obstacle.mesh.position.z) * 0.18;
    } else if (obstacle.kind === 'fog') {
      obstacle.mesh.children.forEach((child, index) => {
        child.position.x = Math.sin(t * 0.9 + index) * 0.35;
      });
    } else if (obstacle.kind === 'traffic') {
      const pulse = 0.42 + Math.sin(t * 9) * 0.18;
      obstacle.mesh.children.forEach((child) => {
        if (child.material?.transparent) child.material.opacity = Math.max(0.22, pulse);
      });
    } else if (obstacle.kind === 'slipstream') {
      obstacle.mesh.children.forEach((child, index) => {
        if (index > 0) child.position.z += dt * 5.5;
        if (child.position.z > 4.4) child.position.z = -3.8;
      });
    }
  }
}

/** Collapsing planks need cannon steps when still near the car. */
function bridgesBlockingIdleLock() {
  if (!car) return false;
  const cz = car.body.position.z;
  for (const o of obstacles) {
    if (o.kind !== 'bridge' || !o.collapsed) continue;
    if (o.body?.type !== CANNON.Body.DYNAMIC) continue;
    const mz = o.mesh?.position?.z ?? 0;
    if (Math.abs(mz - cz) < 140) return true;
  }
  return false;
}

/**
 * True when the car should be visually frozen — no throttle, grounded (or very close to ground),
 * negligible motion, no active curse/drive timers. Lets us skip cannon + interpolation jitter.
 */
function isCarIdle() {
  if (!car || state.phase !== 'running') return false;
  if (bridgesBlockingIdleLock()) return false;

  // Check grounded OR nearly-grounded with low vertical velocity (post-landing tolerance)
  const rideHeight = car.config.scale[1] / 2 + 0.16;
  const nearGround = car.body.position.y < rideHeight + 0.15;
  if (!physicsStats.grounded && !nearGround) return false;

  if (keys.has('w') || keys.has('arrowup') || keys.has('s') || keys.has('arrowdown')) return false;
  if (keys.has('a') || keys.has('arrowleft') || keys.has('d') || keys.has('arrowright')) return false;

  const tiltSteer = state.tiltEnabled ? THREE.MathUtils.clamp(deviceGamma / 24, -1, 1) : 0;
  if (state.tiltEnabled && Math.abs(tiltSteer) > 0.06) return false;

  if (Math.abs(car.forwardSpeed) >= 0.05) return false;
  if (car.shockTTL > 0 || car.oilTTL > 0) return false;
  if (state.windTTL > 0 || state.frictionTTL > 0 || state.fogTTL > 0) return false;

  const v = car.body.velocity;
  if (Math.hypot(v.x, v.z) >= 0.05) return false;
  // More lenient Y velocity check for post-landing settle
  if (Math.abs(v.y) >= 0.15) return false;
  
  const av = car.body.angularVelocity;
  if (Math.abs(av.x) > 0.02 || Math.abs(av.y) > 0.02 || Math.abs(av.z) > 0.02) return false;

  return true;
}

function runBridgeObstaclesStep(dt) {
  for (const o of obstacles) {
    if (o.kind !== 'bridge') continue;
    const fell = updateBridgeCollapse(o, dt, car.body);
    if (fell) {
      playSfx('crash');
      state.shake = Math.max(state.shake, 0.9);
    }
    syncBridgeMesh(o);
  }
}

function runFixedPhysicsStep(dt) {
  const idleFrozen = isCarIdle();

  if (idleFrozen) {
    if (!car.renderState) initCarRenderState();
    car.forwardSpeed = 0;
    car.body.velocity.set(0, 0, 0);
    car.body.angularVelocity.set(0, 0, 0);

    runBridgeObstaclesStep(dt);

    const rs = car.renderState;
    rs.previousPosition.copy(car.body.position);
    rs.previousQuaternion.copy(car.body.quaternion);
    rs.currentPosition.copy(car.body.position);
    rs.currentQuaternion.copy(car.body.quaternion);
    return;
  }

  capturePreviousPhysicsState();
  applyDriving(dt);
  clampCarVelocityForFixedStep();
  world.step(FIXED_DELTA);
  clampCarVelocityForFixedStep();
  checkImpacts();
  stabilizeCarOnTrack(dt);
  runBridgeObstaclesStep(dt);
  captureCurrentPhysicsState();
}

function handlePortals() {
  if (exitPortalHandle && isCarInPortal(car, exitPortalHandle)) {
    triggerExitPortalRedirect(
      car,
      { portalIncoming: PORTAL_BOOTSTRAP, portalUsername: state.portalUsername },
      { damage: state.damage }
    );
  }
  if (
    PORTAL_BOOTSTRAP.isPortal &&
    PORTAL_BOOTSTRAP.ref &&
    entryPortalHandle &&
    isCarInPortal(car, entryPortalHandle)
  ) {
    triggerEntryPortalRedirect(PORTAL_BOOTSTRAP);
  }
  updateRoadStream(roadSegments, car.body.position.z, world);
  for (const t of trees) {
    if (t.trunk.position.z < car.body.position.z - 130) {
      t.trunk.position.z += SCENERY_WRAP_DISTANCE;
      t.top.position.z += SCENERY_WRAP_DISTANCE;
      t.body.position.z += SCENERY_WRAP_DISTANCE;
    }
  }
}

function idlePreview(dt) {
  if (!car) return;
  car.body.position.z = 1;
  car.body.position.x = Math.sin(performance.now() * 0.001) * 0.35;
  car.body.quaternion.setFromEuler(0, Math.sin(performance.now() * 0.001) * 0.15, 0);
  car.body.velocity.set(0, 0, 0);
  car.body.angularVelocity.set(0, 0, 0);
  captureCurrentPhysicsState();
  syncCarMesh(1);
}

function applyDriving(dt) {
  const body = car.body;
  const config = car.config;
  const shockMaxSpeed = Math.max(config.speed * 2.2, 105);
  const baseMaxSpeed = car.oilTTL > 0 ? config.speed * 1.08 : config.speed;
  const maxSpeed = car.shockTTL > 0 ? shockMaxSpeed : baseMaxSpeed;
  const throttle = keys.has('w') || keys.has('arrowup') ? 1 : 0;
  const brake = keys.has('s') || keys.has('arrowdown') ? 1 : 0;
  const steerKey =
    (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + (keys.has('d') || keys.has('arrowright') ? -1 : 0);
  const tiltSteer = state.tiltEnabled ? THREE.MathUtils.clamp(deviceGamma / 24, -1, 1) : 0;
  const useTilt = state.tiltEnabled && Math.abs(tiltSteer) > 0.06;
  const rawSteer = useTilt ? tiltSteer : steerKey;
  const oilInvert = car.oilTTL > 0 ? -1 : 1;
  const steerCommand = rawSteer * oilInvert;
  car.steerSmoothed += (steerCommand - car.steerSmoothed) * (1 - Math.exp(-STEER_INPUT_SMOOTH * dt));
  const steer = car.steerSmoothed;
  const grip = state.frictionTTL > 0 ? state.frictionGrip : 1;
  const oilFactor = (car.oilTTL > 0 ? 0.32 : 1) * THREE.MathUtils.clamp(grip, 0.28, 1.35);
  const offroadFactor = Math.abs(body.position.x) > ROAD_HALF_WIDTH + 2 ? 0.45 : 1;

  car.forwardSpeed += config.accel * throttle * offroadFactor * dt;
  if (brake) car.forwardSpeed -= 58 * dt;
  if (!throttle && !brake && car.shockTTL <= 0) car.forwardSpeed *= Math.pow(0.55, dt);
  if (!throttle && !brake && car.shockTTL > 0) car.forwardSpeed *= Math.pow(0.92, dt);
  car.forwardSpeed = THREE.MathUtils.clamp(car.forwardSpeed, -8, maxSpeed * offroadFactor);

  const steeringPower =
    config.handling * oilFactor * THREE.MathUtils.clamp(Math.abs(car.forwardSpeed) / 30, 0.35, 1.1);
  car.yaw += steer * steeringPower * dt * 0.85;
  car.yaw = THREE.MathUtils.clamp(car.yaw, -0.52, 0.52);
  car.yaw *= Math.pow(car.oilTTL > 0 ? 0.98 : 0.86, dt * 10);

  body.quaternion.toEuler(_scratchEuler);
  const pitchDamp = physicsStats.grounded ? 0.36 : 0.9;
  const rollDamp = physicsStats.grounded ? 0.32 : 0.84;
  body.quaternion.setFromEuler(_scratchEuler.x * pitchDamp, car.yaw, _scratchEuler.z * rollDamp);
  body.angularVelocity.x *= physicsStats.grounded ? 0.32 : 0.45;
  body.angularVelocity.y *= 0.28;
  body.angularVelocity.z *= physicsStats.grounded ? 0.28 : 0.42;
  const windPush = state.windTTL > 0
    ? state.windDirection * (5.5 + Math.min(Math.abs(car.forwardSpeed) * 0.14, 12))
    : 0;
  body.velocity.x = Math.sin(car.yaw) * car.forwardSpeed + steer * oilFactor * 2.4 + windPush;
  body.velocity.z = Math.cos(car.yaw) * car.forwardSpeed;
  body.position.x = THREE.MathUtils.clamp(body.position.x, -PLAYABLE_HALF_WIDTH, PLAYABLE_HALF_WIDTH);

  if (car.oilTTL > 0) car.oilTTL -= dt;
  if (car.shockTTL > 0) car.shockTTL -= dt;
}

function initCarRenderState() {
  if (!car) return;
  car.renderState = {
    previousPosition: car.body.position.clone(),
    currentPosition: car.body.position.clone(),
    previousQuaternion: car.body.quaternion.clone(),
    currentQuaternion: car.body.quaternion.clone()
  };
}

function capturePreviousPhysicsState() {
  if (!car?.renderState) initCarRenderState();
  car.renderState.previousPosition.copy(car.body.position);
  car.renderState.previousQuaternion.copy(car.body.quaternion);
}

function captureCurrentPhysicsState() {
  if (!car?.renderState) initCarRenderState();
  car.renderState.currentPosition.copy(car.body.position);
  car.renderState.currentQuaternion.copy(car.body.quaternion);
}

function clampCarVelocityForFixedStep() {
  if (!car) return;
  const maxVelocity = MAX_STEP_DISPLACEMENT / FIXED_DELTA;
  const vx = car.body.velocity.x;
  const vz = car.body.velocity.z;
  const horizontalSpeed = Math.hypot(vx, vz);
  
  // Dead zone: force zero velocity at idle to stop micro-twitching
  const IDLE_THRESHOLD = 0.08;
  if (horizontalSpeed < IDLE_THRESHOLD && Math.abs(car.forwardSpeed) < IDLE_THRESHOLD) {
    car.body.velocity.x = 0;
    car.body.velocity.z = 0;
    car.body.velocity.y = Math.abs(car.body.velocity.y) < 0.05 ? 0 : car.body.velocity.y;
    car.body.angularVelocity.set(0, 0, 0);
    car.forwardSpeed = 0;
    return;
  }
  
  if (horizontalSpeed > maxVelocity) {
    const scale = maxVelocity / horizontalSpeed;
    car.body.velocity.x *= scale;
    car.body.velocity.z *= scale;
    car.forwardSpeed = Math.sign(car.forwardSpeed || 1) * Math.abs(car.forwardSpeed) * scale;
  }
}

function syncCarMesh(alpha = 1) {
  const rs = car.renderState;
  if (rs) {
    car.mesh.position.set(
      THREE.MathUtils.lerp(rs.previousPosition.x, rs.currentPosition.x, alpha),
      THREE.MathUtils.lerp(rs.previousPosition.y, rs.currentPosition.y, alpha),
      THREE.MathUtils.lerp(rs.previousPosition.z, rs.currentPosition.z, alpha)
    );
    _qMeshPrev.set(rs.previousQuaternion.x, rs.previousQuaternion.y, rs.previousQuaternion.z, rs.previousQuaternion.w);
    _qMeshCurr.set(rs.currentQuaternion.x, rs.currentQuaternion.y, rs.currentQuaternion.z, rs.currentQuaternion.w);
    car.mesh.quaternion.copy(_qMeshPrev.slerp(_qMeshCurr, alpha));
  } else {
    car.mesh.position.copy(car.body.position);
    car.mesh.quaternion.copy(car.body.quaternion);
  }
  const damageTint = THREE.MathUtils.clamp(state.damage / 100, 0, 1);
  const nf = dynamicSky?.getHeadlightFactor?.() ?? 0;
  _scratchBodyColor.set(car.config.color).lerp(_damageColorDeep, damageTint * 0.72);
  car.mesh.traverse((child) => {
    if (child.material?.color && child.material.metalness !== undefined) {
      child.material.color.copy(_scratchBodyColor);
    }
  });
  updateHeadlightIntensity(car, nf);
  applyRoadNightVisuals(nf);
}

function checkObstacleTriggers(dt) {
  copyPresentationPosition(_triggerPos);
  const pos = _triggerPos;
  for (const obstacle of obstacles) {
    const dz = Math.abs(pos.z - obstacle.mesh.position.z);
    if (dz > 5.5) continue;
    const dx = Math.abs(pos.x - obstacle.mesh.position.x);

    if (obstacle.kind === 'oil' && dx < obstacle.radius && dz < 3.2) {
      car.oilTTL = 3.5;
      if (!obstacle.used) {
        obstacle.used = true;
        if (car.shockTTL <= 0) flashMessage('CONTROLS REVERSED');
        playSfx('oil');
      }
    }

    if (obstacle.kind === 'wind' && dx < obstacle.radius && dz < obstacle.radius) {
      state.windTTL = 2.8;
      state.windDirection = obstacle.direction || 1;
      state.curseLabel = obstacle.direction > 0 ? 'WIND RIGHT' : 'WIND LEFT';
      if (!obstacle.used) {
        obstacle.used = true;
        flashMessage(state.curseLabel);
      }
    }

    if (obstacle.kind === 'fog' && dx < 4.3 && dz < obstacle.radius) {
      state.fogTTL = Math.max(state.fogTTL, obstacle.duration || 3.2);
      state.curseLabel = 'FOG BANK';
      if (!obstacle.used) {
        obstacle.used = true;
        flashMessage('FOG BANK');
      }
    }

    if (obstacle.kind === 'friction' && dx < obstacle.radius && dz < 3.8) {
      state.frictionTTL = 1.7;
      state.frictionGrip = obstacle.grip || 1;
      state.curseLabel = obstacle.label || 'GRIP SHIFT';
      if (!obstacle.used) {
        obstacle.used = true;
        flashMessage(state.curseLabel);
      }
    }

    if (obstacle.kind === 'gravity' && !obstacle.used && dx < obstacle.radius && dz < obstacle.radius) {
      obstacle.used = true;
      car.body.velocity.y += obstacle.lift || 14;
      car.forwardSpeed += 12;
      state.shake = Math.max(state.shake, 0.75);
      flashMessage('GRAVITY WELL');
      playSfx('shock');
    }

    if (obstacle.kind === 'slipstream' && dx < 1.7 && dz < obstacle.radius) {
      car.forwardSpeed += (obstacle.boost || 12) * dt;
      state.curseLabel = 'SLIPSTREAM';
      if (!obstacle.used) {
        obstacle.used = true;
        flashMessage('SLIPSTREAM');
      }
    }

    if (obstacle.kind === 'repair' && !obstacle.used && dx < obstacle.radius && dz < 3.2) {
      obstacle.used = true;
      obstacle.mesh.visible = false;
      const before = state.damage;
      state.damage = Math.max(0, state.damage - 16);
      state.repairs += 1;
      if (before > state.damage) flashMessage('FIELD REPAIR');
      else flashMessage('REPAIR BANKED');
      playSfx('win');
    }

    if (obstacle.kind === 'gap' && dx < 3.85 && dz < obstacle.radius) {
      car.body.velocity.y -= (1.2 - car.config.clearance) * dt * 22;
      if (!obstacle.used && car.config.clearance < 0.45) {
        obstacle.used = true;
        addDamage(6 + (0.5 - car.config.clearance) * 15, 'LOW CLEARANCE HIT');
      }
    }
  }

  if (state.selectedMode === 'shock' && state.time > state.nextShockAt) {
    const shockSpeed = Math.max(car.config.speed * 2.2, 108);
    car.shockTTL = 4.2;
    car.forwardSpeed = Math.max(car.forwardSpeed, shockSpeed);
    car.body.velocity.z = Math.max(car.body.velocity.z, shockSpeed);
    car.body.velocity.x += (Math.random() - 0.5) * 13;
    state.nextShockAt = state.time + 15 + Math.random() * 7;
    flashMessage('SPEED SHOCK');
    state.shake = Math.max(state.shake, 2.4);
    playSfx('shock');
  }
}

function checkImpacts() {
  const speed = car.body.velocity.length();
  physicsStats.activeContacts = 0;
  physicsStats.grounded = false;
  if (
    Math.abs(car.body.position.x) > ROAD_HALF_WIDTH + 2 &&
    speed > 14 &&
    state.time - physicsStats.lastShoulderAt > 0.9
  ) {
    physicsStats.lastShoulderAt = state.time;
    car.forwardSpeed *= 0.9;
    addDamage(0.045 * speed, 'OFF-ROAD RATTLE');
  }

  for (const contact of world.contacts) {
    const carIsA = contact.bi === car.body;
    const carIsB = contact.bj === car.body;
    const other = carIsA ? contact.bj : carIsB ? contact.bi : null;
    if (!other) continue;
    physicsStats.activeContacts += 1;
    if (!obstacleBodies.has(other.id)) {
      physicsStats.grounded = true;
      continue;
    }
    const obstacle = obstacleBodies.get(other.id);
    if (!obstacle) continue;
    if (obstacle.kind === 'ramp' || obstacle.kind === 'bump' || obstacle.kind === 'bridge') {
      physicsStats.grounded = true;
    }
    if (obstacle.kind === 'bridge' && !obstacle.collapsed) continue;
    if (state.time - obstacle.lastHitAt < 0.42) continue;
    const force = Math.abs(contact.getImpactVelocityAlongNormal());
    if (force > 5.5) {
      obstacle.lastHitAt = state.time;
      const dmg = force * obstacle.damage * 0.16;
      addDamage(dmg, obstacle.kind.toUpperCase());
      obstacle.used = true;
      if (obstacle.kind === 'ramp') {
        car.body.velocity.y += 2.85;
        car.forwardSpeed += 4.5;
      }
    }
  }
}

function stabilizeCarOnTrack(dt) {
  if (!car || !physicsStats.grounded) return;
  const rideHeight = car.config.scale[1] / 2 + 0.16;
  car.body.velocity.y *= Math.pow(0.65, dt * 60);
  const pull = rideHeight - car.body.position.y;
  if (pull > 0) car.body.position.y += pull * Math.min(1, 32 * dt);
  car.body.velocity.y = Math.max(car.body.velocity.y, -4.5);

  const hasActiveDriveEffect =
    car.shockTTL > 0 ||
    car.oilTTL > 0 ||
    state.windTTL > 0 ||
    state.frictionTTL > 0 ||
    keys.has('w') ||
    keys.has('arrowup') ||
    keys.has('s') ||
    keys.has('arrowdown') ||
    keys.has('a') ||
    keys.has('arrowleft') ||
    keys.has('d') ||
    keys.has('arrowright');

  if (!hasActiveDriveEffect && Math.abs(car.forwardSpeed) < 0.08) {
    car.forwardSpeed = 0;
    car.body.velocity.x = 0;
    car.body.velocity.z = 0;
    car.body.angularVelocity.x = 0;
    car.body.angularVelocity.y = 0;
    if (Math.abs(car.body.angularVelocity.z) < 0.15) car.body.angularVelocity.z = 0;
    
    // Flatten orientation to remove post-landing tilt/wobble
    car.body.quaternion.toEuler(_scratchEuler);
    const pitchMag = Math.abs(_scratchEuler.x);
    const rollMag = Math.abs(_scratchEuler.z);
    if (pitchMag < 0.12 && rollMag < 0.12) {
      // Small tilt: snap to flat
      car.body.quaternion.setFromEuler(0, car.yaw || 0, 0);
    } else {
      // Larger tilt: lerp toward flat quickly
      _flatQuat.setFromEuler(0, car.yaw || 0, 0);
      car.body.quaternion.x += (_flatQuat.x - car.body.quaternion.x) * Math.min(1, 8 * dt);
      car.body.quaternion.y += (_flatQuat.y - car.body.quaternion.y) * Math.min(1, 8 * dt);
      car.body.quaternion.z += (_flatQuat.z - car.body.quaternion.z) * Math.min(1, 8 * dt);
      car.body.quaternion.w += (_flatQuat.w - car.body.quaternion.w) * Math.min(1, 8 * dt);
      car.body.quaternion.normalize();
    }
  }
}

function updateRunState(dt) {
  state.distance = Math.max(0, car.body.position.z);
  runData.distanceSurvived = state.distance;
  runData.cabinDamage = state.damage;

  // Reposition exit portal every 30s to stay ahead of player
  state.portalTimer += dt;
  if (state.portalTimer >= 30) {
    state.portalTimer = 0;
    spawnExitPortal(scene, car.body.position.z + 350);
  }

  const up = new CANNON.Vec3(0, 1, 0);
  const carUp = car.body.quaternion.vmult(up);
  if (carUp.y < 0.15 && car.body.position.y < 2.4) {
    addDamage(6 * dt, 'ROLLOVER');
    if (state.lastGrounded) runData.rolloverCount += 1;
    state.lastGrounded = false;
  } else {
    state.lastGrounded = true;
  }

  const airborne = !physicsStats.grounded && car.body.position.y > car.config.scale[1] / 2 + 0.7;
  if (airborne) runData.airtime += dt;
  if (!airborne && car.grounded === false) {
    car.body.quaternion.toEuler(_scratchEulerLanding);
    const landingAngle = Math.abs(_scratchEulerLanding.x) * 57.3;
    if (landingAngle > 10) runData.landingAngles.push(landingAngle);
    addDamage(Math.max(0, landingAngle - 12) * 0.18, 'ROUGH LANDING');
  }
  car.grounded = !airborne;

  const mode = modeConfigs[state.selectedMode];
  const complete = mode.durationGoal ? state.time >= mode.durationGoal : state.distance >= mode.distanceGoal;
  let ruinedReason = '';
  if (state.damage >= 100) ruinedReason = 'Car destroyed';
  else if (car.body.position.y < -8) ruinedReason = 'Fell through the road';
  else if (Math.abs(car.body.position.x) > PLAYABLE_HALF_WIDTH + 6) ruinedReason = 'Lost in the dark';

  if (complete || ruinedReason) {
    const won = complete && !ruinedReason;
    const reason = won ? `Completed ${mode.name}` : ruinedReason;
    endRun(won, reason);
  }
}

function addDamage(amount, label) {
  if (amount <= 0 || state.phase !== 'running') return;
  const damage = amount / car.config.durability;
  state.damage = THREE.MathUtils.clamp(state.damage + damage, 0, 100);
  const impactSpeed = Math.round(car.body.velocity.length() * 3.6);
  recordImpact(runData, damage, impactSpeed);
  physicsStats.lastImpactLabel = label;
  physicsStats.lastImpactAt = state.time;
  state.shake = Math.max(state.shake, THREE.MathUtils.clamp(damage / 30, 0.12, 1.3));
  if (damage > 2.5) flashMessage(label);
  if (damage > 8) playSfx('crash');
}

function flashMessage(text) {
  state.flashText = text;
  state.flashTTL = 0.9;
  flash.textContent = text;
  flash.classList.add('is-visible');
}

function updateCamera(dt) {
  if (!camera || !car) return;
  if (!cameraRig.ready) initCameraRig();

  state.shake *= Math.pow(CAM_SHAKE_DECAY_PER_S, dt);
  state.flashTTL -= dt;
  if (state.flashTTL <= 0) flash.classList.remove('is-visible');

  /* Menu / results: soft orbit; same spring rig avoids snaps when returning to Run. */
  if (state.phase !== 'running') {
    springDamperVector3(cameraRig.pos, cameraRig.vel, _menuCamTarget, dt, CAM_MENU_STIFFNESS);
    springDamperVector3(cameraRig.lookPos, cameraRig.lookVel, _menuCamLook, dt, CAM_MENU_STIFFNESS * 0.85);
    camera.position.copy(cameraRig.pos);
    cameraLookTarget.copy(cameraRig.lookPos);
    camera.lookAt(cameraLookTarget);
    const menuFov = CAM_FOV_BASE;
    cameraRig.fovSmoothed += (menuFov - cameraRig.fovSmoothed) * Math.min(1, CAM_FOV_SMOOTH * dt);
    camera.fov += (cameraRig.fovSmoothed - camera.fov) * Math.min(1, CAM_FOV_SMOOTH * dt);
    camera.updateProjectionMatrix();
    return;
  }

  const renderPos = car.mesh?.position || car.body.position;
  const rawIdle =
    isCarIdle() && state.shake < 0.02;
  if (rawIdle) cameraRig.idleHoldT += dt;
  else cameraRig.idleHoldT = 0;
  const idleTargetBlend = cameraRig.idleHoldT >= CAM_IDLE_ENTER_SEC ? 1 : 0;
  cameraRig.stableIdleBlend += (idleTargetBlend - cameraRig.stableIdleBlend) *
    (1 - Math.exp(-CAM_IDLE_BLEND_SMOOTH * dt));

  const useIdlePhysics = cameraRig.stableIdleBlend > 0.75;
  const speedMs = useIdlePhysics ? 0 : car.body.velocity.length();
  const speedKmh = speedMs * 3.6;
  const speedNormRaw = THREE.MathUtils.clamp((speedKmh - 22) / 100, 0, 1);
  cameraRig.speedNorm += (speedNormRaw - cameraRig.speedNorm) *
    (1 - Math.exp(-CAM_SPEED_NORM_SMOOTH * dt));
  const speedNorm = cameraRig.speedNorm;

  const steerKey =
    (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0);
  const tiltSteer = state.tiltEnabled ? THREE.MathUtils.clamp(deviceGamma / 24, -1, 1) : 0;
  const useTilt = state.tiltEnabled && Math.abs(tiltSteer) > 0.06;
  const rawSteer = useTilt ? tiltSteer : steerKey;
  const steerTarget = THREE.MathUtils.clamp(rawSteer * CAM_STEER_LEAD_GAIN, -CAM_STEER_LEAD_GAIN, CAM_STEER_LEAD_GAIN);
  cameraRig.steerLead += (steerTarget - cameraRig.steerLead) * (1 - Math.exp(-CAM_STEER_LEAD_SMOOTH * dt));

  const stiffnessPos = THREE.MathUtils.lerp(CAM_STIFFNESS_RUN, CAM_STIFFNESS_IDLE, cameraRig.stableIdleBlend);

  const chase = 6.8 + speedNorm * 3.5;
  const shockExtra = car.shockTTL > 0 ? 2.2 : speedNorm * 1.8;
  const lateral = renderPos.x * (0.35 + speedNorm * 0.08) + cameraRig.steerLead * (1.1 + speedNorm * 0.9);

  _camTarget.set(
    lateral,
    4.2 + speedNorm * 0.8,
    renderPos.z - chase - shockExtra
  );

  const inShock = car.shockTTL > 0;
  const shakeCap = inShock ? 1.15 : 0.75;
  const impactAmp = Math.min(state.shake, shakeCap);
  const rumbleAmp = Math.min(state.shake * CAM_SHAKE_RUMBLE_MUL, shakeCap * 0.65) + (inShock ? CAM_SHOCK_RUMBLE : 0);
  const t = state.time;
  if (impactAmp > 0.004) {
    _camTarget.x += (Math.sin(t * 31) * 0.45 + Math.sin(t * 13) * 0.25) * impactAmp * CAM_SHAKE_IMPACT_HI;
    _camTarget.y += (Math.cos(t * 23) * 0.16 + Math.sin(t * 17) * 0.08) * impactAmp * CAM_SHAKE_IMPACT_HI;
  }
  if (rumbleAmp > 0.004) {
    _camTarget.x += Math.sin(t * 7.2 + renderPos.z * 0.02) * 0.22 * rumbleAmp;
    _camTarget.y += Math.cos(t * 5.1) * 0.1 * rumbleAmp;
  }

  springDamperVector3(cameraRig.pos, cameraRig.vel, _camTarget, dt, stiffnessPos);
  camera.position.copy(cameraRig.pos);

  const lookAhead = 8 + speedNorm * 6;
  const lookX = renderPos.x * (0.32 + speedNorm * 0.18) + cameraRig.steerLead * (2.2 + speedNorm * 2.5);
  _camLook.set(lookX, 1.4 - speedNorm * 0.35, renderPos.z + lookAhead);

  const stiffnessLook = THREE.MathUtils.lerp(CAM_STIFFNESS_LOOK, CAM_STIFFNESS_LOOK * 1.35, cameraRig.stableIdleBlend);
  springDamperVector3(cameraRig.lookPos, cameraRig.lookVel, _camLook, dt, stiffnessLook);
  cameraLookTarget.copy(cameraRig.lookPos);
  camera.lookAt(cameraLookTarget);

  let wantFov = CAM_FOV_BASE + speedNorm * CAM_FOV_SPEED_MUL;
  if (inShock) wantFov += CAM_FOV_SHOCK_ADD;
  const fovCap = inShock ? CAM_FOV_MAX_SHOCK : CAM_FOV_MAX_NORMAL;
  wantFov = Math.min(wantFov, fovCap);
  cameraRig.fovSmoothed += (wantFov - cameraRig.fovSmoothed) * Math.min(1, CAM_FOV_SMOOTH * dt);
  camera.fov += (cameraRig.fovSmoothed - camera.fov) * Math.min(1, CAM_FOV_SMOOTH * 1.15 * dt);
  camera.updateProjectionMatrix();
}

function endRun(won, reason = won ? 'Road survived' : 'Run over') {
  state.phase = 'results';
  stopEngineForMenu();
  markRunCompletedOnce();
  finishState.won = won;
  finishState.reason = reason;
  const result = calculateSurvival();
  const { bestAllTime, dailyBest } = persistScores(state.selectedMode, result);
  state.highScore = bestAllTime;
  playSfx(won ? 'win' : 'lose');
  const card = document.querySelector('#result-card');
  if (card) {
    showResultsPanel({
      resultsEl: results,
      resultCardEl: card,
      won,
      reason,
      result,
      bestAllTime,
      selectedMode: state.selectedMode,
      dailyBest,
      repairs: state.repairs
    });
  }
  refreshPicker();
  syncGameCanvasPointerBlocking();
}

function calculateSurvival() {
  const result = scoreSurvival(runData, modeConfigs[state.selectedMode].distanceGoal, state.damage);
  return { ...result, status: result.status.toUpperCase() };
}

async function shareResult() {
  const result = calculateSurvival();
  const text = formatShareText(carConfigs[state.selectedCar].name, result, {
    dailyDate: state.selectedMode === 'daily' ? getDailySeedDateString() : undefined
  });
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied share text');
  } catch {
    showToast(text);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

init();
requestAnimationFrame(loop);
