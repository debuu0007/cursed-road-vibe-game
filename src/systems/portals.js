/**
 * Vibe Jam 2026 webring portals (entry + exit).
 * @see README — portal query params forwarded for continuity.
 */

import * as THREE from 'three';

export const EXIT_PORTAL_URL = 'https://vibejam.cc/portal/2026';

/** @typedef {{ group: THREE.Group, center: THREE.Vector3, radius: number, particles: THREE.Points|null, positions: Float32Array|null }} PortalHandle */

/** @type {PortalHandle | null} */
export let exitPortalHandle = null;

/** @type {PortalHandle | null} */
export let entryPortalHandle = null;

let redirectLock = '';

function clampParam(v, maxLen = 380) {
  return String(v ?? '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .slice(0, maxLen);
}

/** Canonical URL players can use as `ref` back to this build. */
export function gameRefUrlForExit() {
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * @returns {{
 *   isPortal: boolean,
 *   raw: URLSearchParams,
 *   username: string,
 *   color: string,
 *   speed: string,
 *   ref: string,
 *   avatar_url: string,
 *   team: string,
 *   hp: string,
 *   speed_x: string,
 *   speed_y: string,
 *   speed_z: string,
 *   rotation_x: string,
 *   rotation_y: string,
 *   rotation_z: string,
 * }}
 */
export function parsePortalParams() {
  const raw = new URLSearchParams(window.location.search);
  const isPortal = raw.get('portal') === 'true';

  const getStr = (k) => raw.get(k) || '';

  return {
    isPortal,
    raw,
    username: getStr('username'),
    color: getStr('color'),
    speed: getStr('speed'),
    ref: getStr('ref'),
    avatar_url: getStr('avatar_url'),
    team: getStr('team'),
    hp: getStr('hp'),
    speed_x: getStr('speed_x'),
    speed_y: getStr('speed_y'),
    speed_z: getStr('speed_z'),
    rotation_x: getStr('rotation_x'),
    rotation_y: getStr('rotation_y'),
    rotation_z: getStr('rotation_z')
  };
}

/** @returns {THREE.Group} */
function makeCanvasLabel(text, fg, px = 26) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 128;
  const c2d = canvas.getContext('2d');
  if (c2d) {
    c2d.fillStyle = 'rgba(0,0,0,0.72)';
    c2d.fillRect(24, 24, canvas.width - 48, canvas.height - 48);
    c2d.fillStyle = fg;
    c2d.font = `bold ${px}px ui-monospace, Menlo, monospace`;
    c2d.textAlign = 'center';
    c2d.textBaseline = 'middle';
    c2d.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 2.35),
    new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
  );
  label.position.set(0, 6.2, 0);
  return label;
}

/**
 * @param {THREE.Scene} scene
 * @param {number} x
 * @param {number} z
 * @param {number} colorHex torus/emissive base
 * @param {number} particleR
 * @param {number} particleG
 * @param {number} particleB
 * @param {string} labelText
 */
function createPortalAt(scene, x, z, colorHex, particleR, particleG, particleB, labelText, labelHex) {
  const group = new THREE.Group();
  group.position.set(x, 4.2, z);
  group.rotation.x = Math.PI / 2;
  group.rotation.y = Math.PI;

  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(5, 0.62, 12, 64),
    new THREE.MeshPhongMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.42,
      transparent: true,
      opacity: 0.88,
      shininess: 76
    })
  );

  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(4.05, 32),
    new THREE.MeshLambertMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide
    })
  );
  inner.rotation.x = Math.PI / 2;

  group.add(torus);
  group.add(inner);
  group.add(makeCanvasLabel(labelText, labelHex));

  const n = 400;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + (Math.random() - 0.5) * 1.6;
    positions[i] = Math.cos(angle) * radius;
    positions[i + 1] = Math.sin(angle) * radius;
    positions[i + 2] = (Math.random() - 0.5) * 2;
    colors[i] = particleR * (0.7 + Math.random() * 0.3);
    colors[i + 1] = particleG * (0.7 + Math.random() * 0.3);
    colors[i + 2] = particleB * (0.7 + Math.random() * 0.3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.65 })
  );
  group.add(pts);

  scene.add(group);

  return {
    group,
    center: new THREE.Vector3(x, 4.2, z),
    radius: 11,
    particles: pts,
    positions
  };
}

/**
 * Exit portal (green) — drive in to portal forward.
 * @param {THREE.Scene} scene
 */
export function spawnExitPortal(scene) {
  if (exitPortalHandle) scene.remove(exitPortalHandle.group);
  exitPortalHandle = createPortalAt(scene, -15.5, 850, 0x00ff44, 0, 0.95, 0.35, 'VIBE JAM PORTAL', '#7cff9a');
}

/**
 * Return portal (red) — appears when arriving from hub with ?ref=
 * @param {THREE.Scene} scene
 */
export function spawnEntryPortal(scene) {
  if (entryPortalHandle) scene.remove(entryPortalHandle.group);
  entryPortalHandle = createPortalAt(scene, 15.5, -42, 0xff2244, 0.92, 0.12, 0.12, 'BACK TO LAST GAME', '#ffb3b8');
}

/** Call each frame during gameplay */
export function updatePortalAnimations(nowMs) {
  const wobble = Math.sin(nowMs * 0.002);

  /** @type {(h: PortalHandle|null) => void} */
  const swirl = (h) => {
    if (!h?.particles?.geometry?.attributes?.position?.array || !h.positions) return;
    const arr = h.particles.geometry.attributes.position.array;
    const base = h.positions;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 2] = base[i + 2] + 0.12 * Math.sin(nowMs * 0.002 + i);
    }
    h.particles.geometry.attributes.position.needsUpdate = true;
    const firstMesh = /** @type {THREE.Mesh | undefined} */ (h.group.children[0]);
    if (firstMesh) firstMesh.rotation.z = wobble * 0.04;
  };
  swirl(exitPortalHandle);
  swirl(entryPortalHandle);
}

/**
 * Car center vs portal center (cheap sphere test).
 */
export function isCarInPortal(car, handle) {
  if (!car?.body || !handle) return false;
  const p = car.body.position;
  const c = handle.center;
  const dx = p.x - c.x;
  const dy = p.y - c.y - 1.25;
  const dz = p.z - c.z;
  const r = handle.radius;
  return dx * dx + dy * dy + dz * dz < r * r;
}

function normalizeOutboundRef(url) {
  if (!url) return '';
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`;
    return url;
  } catch {
    return '';
  }
}

/**
 * Redirect to vibejam hub with forwarded continuity fields.
 * @param {object} portalState — from game ({ portalIncoming, portalUsername })
 * @param {{ damage: number }} carCtx
 */
export function triggerExitPortalRedirect(car, portalState, carCtx) {
  const key = 'exit';
  if (redirectLock === key) return;
  if (!car?.body) return;

  const spd = car.body.velocity.length();
  const v = car.body.velocity;

  const cq = car.body.quaternion;
  const q = new THREE.Quaternion(cq.x, cq.y, cq.z, cq.w);
  const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');

  const incoming = portalState?.portalIncoming;
  let displayName = clampParam(portalState?.portalUsername || incoming?.username || 'player', 80);
  if (!displayName) displayName = 'player';

  const params = new URLSearchParams();
  params.set('portal', 'true');
  params.set('username', displayName);

  const hexColor =
    car.config?.color != null
      ? `#${Number(car.config.color).toString(16).padStart(6, '0')}`
      : 'white';
  params.set('color', clampParam(hexColor, 32));

  params.set('speed', String(Math.round(spd * 100) / 100));
  params.set('speed_x', String(Math.round(v.x * 100) / 100));
  params.set('speed_y', String(Math.round(v.y * 100) / 100));
  params.set('speed_z', String(Math.round(v.z * 100) / 100));
  params.set('rotation_x', String(Math.round(euler.x * 1000) / 1000));
  params.set('rotation_y', String(Math.round(euler.y * 1000) / 1000));
  params.set('rotation_z', String(Math.round(euler.z * 1000) / 1000));
  params.set('hp', String(Math.max(0, Math.round(100 - (carCtx?.damage ?? 0)))));

  if (incoming?.avatar_url) params.set('avatar_url', clampParam(incoming.avatar_url, 420));
  if (incoming?.team) params.set('team', clampParam(incoming.team, 80));

  if (incoming?.raw instanceof URLSearchParams) {
    for (const [k, val] of incoming.raw.entries()) {
      if (k === 'ref' || k === 'portal' || params.has(k)) continue;
      params.append(k, clampParam(val));
    }
  }

  params.set('ref', clampParam(gameRefUrlForExit(), 520));

  redirectLock = key;
  window.location.href = `${EXIT_PORTAL_URL}?${params.toString()}`;
}

/**
 * Redirect back to `ref` preserving forwarded params except `ref`.
 */
export function triggerEntryPortalRedirect(portalIncoming) {
  const key = 'entry';
  if (redirectLock === key) return;
  const current = portalIncoming ?? parsePortalParams();
  let base = normalizeOutboundRef(current.ref);
  if (!base) return;

  const outgoing = new URLSearchParams(window.location.search);
  outgoing.delete('ref');
  outgoing.set('portal', 'true');
  outgoing.set('ref', clampParam(gameRefUrlForExit(), 520));

  redirectLock = key;
  const sep = base.includes('?') ? '&' : '?';
  window.location.href = `${base}${sep}${outgoing.toString()}`;
}
