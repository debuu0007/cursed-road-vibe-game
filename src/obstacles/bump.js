import * as THREE from 'three';
import { addStaticBox } from './helpers.js';

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addBump(ctx, z, x) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.34, 1.8),
    new THREE.MeshLambertMaterial({ color: 0x665a4e })
  );
  return addStaticBox(ctx, mesh, x, 0.11, z, 2.4, 0.34, 1.8, 'bump', 3);
}
