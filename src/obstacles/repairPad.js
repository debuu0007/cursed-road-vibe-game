import * as THREE from 'three';

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addRepairPad(ctx, x, z) {
  const { scene, obstacles } = ctx;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.045, 3.4),
    new THREE.MeshLambertMaterial({
      color: 0x66e08f,
      emissive: 0x183d25
    })
  );
  mesh.position.set(x, 0.04, z);
  scene.add(mesh);
  const obstacle = { mesh, body: null, kind: 'repair', damage: 0, used: false, radius: 2.2 };
  obstacles.push(obstacle);
  return obstacle;
}
