import * as THREE from 'three';

function makePlane(width, depth, color, opacity) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.045, depth),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
  );
  return mesh;
}

function addZone(ctx, mesh, kind, x, z, radius, extra = {}) {
  const { scene, obstacles } = ctx;
  mesh.position.set(x, extra.y ?? 0.055, z);
  scene.add(mesh);
  const obstacle = {
    mesh,
    body: null,
    kind,
    damage: 0,
    used: false,
    radius,
    lastHitAt: -99,
    ...extra
  };
  obstacles.push(obstacle);
  return obstacle;
}

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addWindGust(ctx, z, direction = 1) {
  const mesh = new THREE.Group();
  const base = makePlane(7.8, 7.6, 0x9fd7ff, 0.18);
  mesh.add(base);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.78 });
  for (let i = 0; i < 5; i += 1) {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.055, 0.16), arrowMat);
    shaft.position.set(direction * (-2.3 + i * 1.15), 0.06, -2.4 + i * 1.2);
    shaft.rotation.y = direction > 0 ? -0.22 : 0.22;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 3), arrowMat);
    head.position.set(shaft.position.x + direction * 0.95, 0.08, shaft.position.z);
    head.rotation.z = direction > 0 ? -Math.PI / 2 : Math.PI / 2;
    head.rotation.y = Math.PI / 2;
    mesh.add(shaft, head);
  }
  return addZone(ctx, mesh, 'wind', 0, z, 4.2, { direction, strength: 9 });
}

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addFogPatch(ctx, z, size = 12) {
  const mesh = new THREE.Group();
  mesh.add(makePlane(8.4, size, 0xd8dde0, 0.18));
  const fogMat = new THREE.MeshBasicMaterial({
    color: 0xdfe5e8,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });
  for (let i = 0; i < 4; i += 1) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 2.8), fogMat);
    sheet.position.set(0, 1.15, -size * 0.42 + i * (size * 0.28));
    sheet.rotation.x = -0.08;
    mesh.add(sheet);
  }
  return addZone(ctx, mesh, 'fog', 0, z, size * 0.62, { duration: 3.6 });
}

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addGravityWell(ctx, x, z) {
  const mesh = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.35, 0.045, 34),
    new THREE.MeshBasicMaterial({ color: 0x7d5cff, transparent: true, opacity: 0.38 })
  );
  disc.rotation.x = Math.PI / 2;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xd9ccff, transparent: true, opacity: 0.82 });
  for (const radius of [1.1, 1.75, 2.35]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 6, 34), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08 + radius * 0.04;
    mesh.add(ring);
  }
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.46, 2.5, 12),
    new THREE.MeshBasicMaterial({ color: 0xa88cff, transparent: true, opacity: 0.34 })
  );
  pillar.position.y = 1.18;
  mesh.add(disc, pillar);
  return addZone(ctx, mesh, 'gravity', x, z, 2.55, { lift: 14 });
}

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addFrictionZone(ctx, x, z, type = 'ice') {
  const isIce = type === 'ice';
  const mesh = new THREE.Group();
  mesh.add(makePlane(3.4, 6.7, isIce ? 0x9de8ff : 0xc9b27d, isIce ? 0.46 : 0.55));
  const stripeMat = new THREE.MeshBasicMaterial({
    color: isIce ? 0xe7fbff : 0x7a6242,
    transparent: true,
    opacity: 0.82
  });
  for (let i = 0; i < 5; i += 1) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.055, 0.13), stripeMat);
    stripe.position.set(0, 0.06, -2.7 + i * 1.35);
    stripe.rotation.y = isIce ? 0.42 : -0.32;
    mesh.add(stripe);
  }
  return addZone(ctx, mesh, 'friction', x, z, 3.2, {
    grip: isIce ? 0.42 : 1.28,
    label: isIce ? 'LOW GRIP' : 'GRAVEL GRIP'
  });
}

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addTraffic(ctx, x, z, speed = 42) {
  const group = new THREE.Group();
  const warningMat = new THREE.MeshBasicMaterial({ color: 0xff4242, transparent: true, opacity: 0.34 });
  const laneWarn = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.045, 26), warningMat);
  laneWarn.position.set(0, 0.04, -8);
  group.add(laneWarn);
  const chevronMat = new THREE.MeshBasicMaterial({ color: 0xfff0f0, transparent: true, opacity: 0.88 });
  for (let i = 0; i < 4; i += 1) {
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.12), chevronMat);
    const right = left.clone();
    left.position.set(-0.32, 0.08, -18 + i * 5.2);
    right.position.set(0.32, 0.08, -18 + i * 5.2);
    left.rotation.y = 0.55;
    right.rotation.y = -0.55;
    group.add(left, right);
  }
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.82, 3.45),
    new THREE.MeshLambertMaterial({ color: 0xfff4db })
  );
  body.position.y = 0.48;
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.42, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x222b35 })
  );
  glass.position.set(0, 0.9, -0.28);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
  for (const hx of [-0.55, 0.55]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.08), headMat);
    headlight.position.set(hx, 0.56, -1.78);
    group.add(headlight);
  }
  group.add(body, glass);
  return addZone(ctx, group, 'traffic', x, z, 2.1, { speed, y: 0, hitDamage: 46 });
}

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addSlipstream(ctx, x, z) {
  const mesh = new THREE.Group();
  mesh.add(makePlane(2.25, 9.8, 0x68f5bf, 0.2));
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xb8ffe2, transparent: true, opacity: 0.88 });
  for (let i = 0; i < 4; i += 1) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 3), arrowMat);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.09, -3.4 + i * 2.2);
    mesh.add(arrow);
  }
  return addZone(ctx, mesh, 'slipstream', x, z, 5.1, { boost: 15 });
}
