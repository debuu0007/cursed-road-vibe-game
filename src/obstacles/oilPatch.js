import * as THREE from 'three';
import { oilGeometry, oilMaterial } from './sharedGeometry.js';

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addOil(ctx, x, z) {
  const { scene, obstacles } = ctx;
  const mesh = new THREE.Mesh(oilGeometry, oilMaterial);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, 0.035, z);
  scene.add(mesh);
  const obstacle = { mesh, body: null, kind: 'oil', damage: 0, used: false, radius: 2.7 };
  obstacles.push(obstacle);
  return obstacle;
}
