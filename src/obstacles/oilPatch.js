import * as THREE from 'three';

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addOil(ctx, x, z) {
  const { scene, obstacles } = ctx;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(2.15, 2.6, 0.035, 24),
    new THREE.MeshLambertMaterial({ color: 0x050607, transparent: true, opacity: 0.78 })
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, 0.035, z);
  scene.add(mesh);
  const obstacle = { mesh, body: null, kind: 'oil', damage: 0, used: false, radius: 2.7 };
  obstacles.push(obstacle);
  return obstacle;
}
