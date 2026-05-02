import * as THREE from 'three';
import { addStaticBox } from './helpers.js';
import { dividerGeometry, dividerMaterial } from './sharedGeometry.js';

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addDivider(ctx, x, z) {
  const mesh = new THREE.Mesh(dividerGeometry, dividerMaterial);
  return addStaticBox(ctx, mesh, x, 0.38, z, 0.55, 0.75, 4.8, 'divider', 14);
}
