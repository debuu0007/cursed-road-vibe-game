import * as THREE from 'three';
import { addStaticBox } from './helpers.js';
import { bumpGeometry, bumpMaterial } from './sharedGeometry.js';

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addBump(ctx, z, x) {
  const mesh = new THREE.Mesh(bumpGeometry, bumpMaterial);
  return addStaticBox(ctx, mesh, x, 0.11, z, 2.4, 0.34, 1.8, 'bump', 3);
}
