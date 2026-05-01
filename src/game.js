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
import { spawnRoad, resetRoadSegments, updateRoadStream } from './track.js';
import { makeCarMesh, createCarBody } from './cars/carBase.js';
import { carConfigs, isRickshawUnlocked, markRunCompletedOnce } from './cars/index.js';
import { spawnObstaclesForMode } from './obstacles/spawnByMode.js';
import { updateBridgeCollapse, syncBridgeMesh } from './obstacles/bridge.js';
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
  selectedCar: 'hatchback',
  selectedMode: 'gauntlet',
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
  repairs: 0,
  /** Incoming player tag from portal (optional). */
  portalUsername: ''
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
let world;
let car;
let carGltfSpawnToken = 0;
let fixedStepAccumulator = 0;
let lastTime = performance.now();
const cameraLookTarget = new THREE.Vector3();
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
  if (/(yellow|orange|gold|amber)/i.test(c)) return rickshawOk ? 'rickshaw' : 'hatchback';
  if (/truck|brown|taupe/.test(c) || c === '#8b7c6a') return 'truck';
  if (/(red|crimson|ruby)/i.test(c)) return 'hatchback';
  if (/(white|silver|grey|gray)/i.test(c)) return 'suv';
  return 'hatchback';
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
  world = createWorld();
  const hemi = new THREE.HemisphereLight(0x87CEEB, 0x4a7c3a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(-8, 15, -6);
  scene.add(sun);
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
  car = { body, mesh, config, grounded: true, oilTTL: 0, shockTTL: 0, yaw: 0, forwardSpeed: 0 };
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
  const boost = pendingPortalForwardSpeed;
  if (boost != null && car) {
    car.forwardSpeed = THREE.MathUtils.clamp(boost * 1.03, 0, Math.max(car.config.speed * 2.9, boost));
    pendingPortalForwardSpeed = null;
  }
  fixedStepAccumulator = 0;
  state.phase = 'running';
  state.damage = 0;
  state.distance = 0;
  state.time = 0;
  state.shockTimer = 8;
  state.nextShockAt = state.selectedMode === 'shock' ? 2.5 : 8 + Math.random() * 6;
  state.flashText = '';
  state.flashTTL = 0;
  state.repairs = 0;
  flash.textContent = '';
  flash.classList.remove('is-visible');
  finishState.won = false;
  finishState.reason = 'Running';
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

function clearObstacles() {
  for (const obstacle of obstacles) {
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
  if (state.selectedCar === 'rickshaw' && !isRickshawUnlocked()) state.selectedCar = 'hatchback';
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
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (!renderer || !scene || !camera || !car) {
    requestAnimationFrame(loop);
    return;
  }
  updatePortalAnimations(now);
  if (state.phase === 'running') updateGame(dt);
  else {
    idlePreview(dt);
    stopEngineForMenu();
  }
  updateCamera(dt);
  renderer.render(scene, camera);
  drawHUD(window.innerWidth, window.innerHeight, {
    ctx,
    state,
    car,
    modes: modeConfigs,
    phase: state.phase
  });
  const kmh = car ? Math.round(car.body.velocity.length() * 3.6) : 0;
  if (car) updateEngineAudio(kmh, state.phase);
  requestAnimationFrame(loop);
}

function fixedPhysics(dt) {
  fixedStepAccumulator += dt;
  while (fixedStepAccumulator >= 1 / 60) {
    world.step(1 / 60);
    fixedStepAccumulator -= 1 / 60;
  }
}

function updateGame(dt) {
  state.time += dt;
  runData.timeAlive = state.time;
  applyDriving(dt);
  fixedPhysics(dt);
  checkImpacts();
  stabilizeCarOnTrack(dt);
  syncCarMesh();
  for (const o of obstacles) {
    if (o.kind === 'bridge') {
      const fell = updateBridgeCollapse(o, dt, car.body);
      if (fell) {
        playSfx('crash');
        state.shake = Math.max(state.shake, 0.9);
      }
      syncBridgeMesh(o);
    }
  }
  checkObstacleTriggers(dt);
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
  updateRunState(dt);
}

function idlePreview(dt) {
  if (!car) return;
  car.body.position.z = 1;
  car.body.position.x = Math.sin(performance.now() * 0.001) * 0.35;
  car.body.quaternion.setFromEuler(0, Math.sin(performance.now() * 0.001) * 0.15, 0);
  syncCarMesh();
  camera.position.lerp(new THREE.Vector3(0, 4.8, -8.5), 0.04);
  camera.lookAt(0, 0.7, 2);
  fixedPhysics(dt);
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
  const steer = rawSteer * oilInvert;
  const oilFactor = car.oilTTL > 0 ? 0.32 : 1;
  const offroadFactor = Math.abs(body.position.x) > ROAD_HALF_WIDTH + 2 ? 0.72 : 1;

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

  const euler = new CANNON.Vec3();
  body.quaternion.toEuler(euler);
  const pitchDamp = physicsStats.grounded ? 0.36 : 0.9;
  const rollDamp = physicsStats.grounded ? 0.32 : 0.84;
  body.quaternion.setFromEuler(euler.x * pitchDamp, car.yaw, euler.z * rollDamp);
  body.angularVelocity.x *= physicsStats.grounded ? 0.32 : 0.45;
  body.angularVelocity.y *= 0.28;
  body.angularVelocity.z *= physicsStats.grounded ? 0.28 : 0.42;
  body.velocity.x = Math.sin(car.yaw) * car.forwardSpeed + steer * oilFactor * 2.4;
  body.velocity.z = Math.cos(car.yaw) * car.forwardSpeed;
  body.position.x = THREE.MathUtils.clamp(body.position.x, -PLAYABLE_HALF_WIDTH, PLAYABLE_HALF_WIDTH);

  if (car.oilTTL > 0) car.oilTTL -= dt;
  if (car.shockTTL > 0) car.shockTTL -= dt;
}

function syncCarMesh() {
  car.mesh.position.copy(car.body.position);
  car.mesh.quaternion.copy(car.body.quaternion);
  const damageTint = THREE.MathUtils.clamp(state.damage / 100, 0, 1);
  car.mesh.traverse((child) => {
    if (child.material?.color && child.material.metalness !== undefined) {
      child.material.color.set(car.config.color).lerp(new THREE.Color(0x2b0907), damageTint * 0.72);
    }
  });
}

function checkObstacleTriggers(dt) {
  const pos = car.body.position;
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
    state.nextShockAt = state.time + 9 + Math.random() * 5;
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
    speed > 20 &&
    state.time - physicsStats.lastShoulderAt > 1.3
  ) {
    physicsStats.lastShoulderAt = state.time;
    addDamage(0.025 * speed, 'OFF-ROAD RATTLE');
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
}

function updateRunState(dt) {
  state.distance = Math.max(0, car.body.position.z);
  runData.distanceSurvived = state.distance;
  runData.cabinDamage = state.damage;

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
    const euler = new CANNON.Vec3();
    car.body.quaternion.toEuler(euler);
    const landingAngle = Math.abs(euler.x) * 57.3;
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
  if (!car) return;
  state.shake *= Math.pow(0.03, dt);
  state.flashTTL -= dt;
  if (state.flashTTL <= 0) flash.classList.remove('is-visible');

  const speedMs = car.body.velocity.length();
  const speedKmh = speedMs * 3.6;
  const speedNorm = THREE.MathUtils.clamp((speedKmh - 22) / 100, 0, 1);

  // Keep camera closer at high speed instead of pulling far back
  const chase = 6.8 + speedNorm * 3.5;
  const shockExtra = car.shockTTL > 0 ? 2.2 : speedNorm * 1.8;
  const target = new THREE.Vector3(
    car.body.position.x * (0.35 + speedNorm * 0.08),
    4.2 + speedNorm * 0.8,
    car.body.position.z - chase - shockExtra
  );
  const shake = Math.min(state.shake, car.shockTTL > 0 ? 1.2 : 0.75);
  if (shake > 0.01) {
    const t = state.time;
    target.x += (Math.sin(t * 31) * 0.45 + Math.sin(t * 13) * 0.25) * shake;
    target.y += (Math.cos(t * 23) * 0.16 + Math.sin(t * 17) * 0.08) * shake;
  }
  const follow = car.shockTTL > 0 ? 1 - Math.pow(0.015, dt) : 1 - Math.pow(0.001, dt);
  camera.position.lerp(target, follow);
  
  const lookAhead = 8 + speedNorm * 6;
  const look = new THREE.Vector3(
    car.body.position.x * (0.32 + speedNorm * 0.18),
    1.4 - speedNorm * 0.35,
    car.body.position.z + lookAhead
  );
  cameraLookTarget.lerp(look, 1 - Math.pow(0.002, dt));
  camera.lookAt(cameraLookTarget);
  
  let targetFov = 58 + speedNorm * 24;
  if (car.shockTTL > 0) targetFov += 12;
  camera.fov += (targetFov - camera.fov) * (1 - Math.pow(0.001, dt));
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
