import * as THREE from 'three';
import { SHARED_GEOMETRIES, SHARED_MATERIALS } from './sharedGeometry.js';

/**
 * Dispose GPU resources for meshes not using shared geometries/materials.
 * @param {THREE.Object3D | null | undefined} root
 */
export function disposeObject3D(root) {
  if (!root) return;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      const g = child.geometry;
      if (g && !SHARED_GEOMETRIES.has(g)) g.dispose();

      const m = child.material;
      if (!m) return;
      const mats = Array.isArray(m) ? m : [m];
      for (const mat of mats) {
        if (mat && !SHARED_MATERIALS.has(mat)) mat.dispose();
      }
    }
  });
}
