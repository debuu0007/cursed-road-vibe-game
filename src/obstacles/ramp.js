import * as THREE from 'three';
import { addStaticBox } from './helpers.js';
import { rampGeometry, rampMaterial } from './sharedGeometry.js';

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addRamp(ctx, z, x) {
  const mesh = new THREE.Mesh(rampGeometry, rampMaterial);
  mesh.rotation.x = -0.34;
  const obstacle = addStaticBox(ctx, mesh, x, 0.11, z, 3.2, 0.3, 4.2, 'ramp', 1);
  obstacle.body.quaternion.setFromEuler(-0.34, 0, 0);
  return obstacle;
}
