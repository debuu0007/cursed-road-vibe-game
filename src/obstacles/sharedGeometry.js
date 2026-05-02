import * as THREE from 'three';

/**
 * Cached geometries/materials for fixed-shape obstacles — reduces allocations per spawn.
 * Do NOT dispose these in clearObstacles (app lifetime).
 */
export const bumpGeometry = new THREE.BoxGeometry(2.4, 0.34, 1.8);
export const rampGeometry = new THREE.BoxGeometry(3.2, 0.3, 4.2);
export const dividerGeometry = new THREE.BoxGeometry(0.55, 0.75, 4.8);
export const oilGeometry = new THREE.CylinderGeometry(2.15, 2.6, 0.035, 24);

export const bumpMaterial = new THREE.MeshLambertMaterial({ color: 0x665a4e });
export const rampMaterial = new THREE.MeshLambertMaterial({ color: 0xd39247 });
export const dividerMaterial = new THREE.MeshLambertMaterial({ color: 0xb9bab4 });
export const oilMaterial = new THREE.MeshLambertMaterial({
  color: 0x050607,
  transparent: true,
  opacity: 0.78
});

/** @type {WeakSet<THREE.BufferGeometry>} */
export const SHARED_GEOMETRIES = new WeakSet([
  bumpGeometry,
  rampGeometry,
  dividerGeometry,
  oilGeometry
]);

/** @type {WeakSet<THREE.Material>} */
export const SHARED_MATERIALS = new WeakSet([
  bumpMaterial,
  rampMaterial,
  dividerMaterial,
  oilMaterial
]);
