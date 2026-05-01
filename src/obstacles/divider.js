import * as THREE from 'three';
import { addStaticBox } from './helpers.js';

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addDivider(ctx, x, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.75, 4.8),
    new THREE.MeshLambertMaterial({ color: 0xb9bab4 })
  );
  return addStaticBox(ctx, mesh, x, 0.38, z, 0.55, 0.75, 4.8, 'divider', 14);
}
