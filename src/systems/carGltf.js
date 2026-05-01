import * as THREE from 'three';
import { loadCarGLB, fitCarVisualToConfig } from '../utils/loader.js';

/** @typedef {{ mesh: THREE.Object3D, config: { scale: number[], glbRotationY?: number } }} CarHandle */

/** Cache GLTF roots (cloned per swap — never detach the cached template). */
const gltfRoots = new Map();

/**
 * Replace procedural meshes with loaded GLTF when the geometry is sane.
 * Heading comes from physics on `car.mesh`; GLB yaw fix lives on child pivot only.
 *
 * @param {CarHandle} car
 * @param {THREE.Object3D} templateRoot
 * @param {{ scale: [number, number, number], glbRotationY?: number }} cfg — use `configs[carId]` (not stale state)
 */
export function swapIfValidGltfRoot(car, templateRoot, cfg) {
  if (!car?.mesh || !templateRoot || !cfg?.scale) return false;

  const clone = templateRoot.clone(true);
  fitCarVisualToConfig(clone, cfg.scale);

  clone.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(clone);
  const extent = Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z);
  let meshCount = 0;
  clone.traverse((child) => {
    if (child.isMesh) meshCount += 1;
  });

  if (meshCount < 1 || !Number.isFinite(extent) || extent < 0.05) {
    return false;
  }

  const yaw = typeof cfg.glbRotationY === 'number' ? cfg.glbRotationY : 0;
  const pivot = new THREE.Group();
  pivot.name = 'carGltfPivot';
  pivot.rotation.y = yaw;
  pivot.add(clone);

  while (car.mesh.children.length) car.mesh.remove(car.mesh.children[0]);
  car.mesh.add(pivot);
  return true;
}

/**
 * @param {string} carId
 * @param {CarHandle} car
 * @param {Record<string, { glb?: string | null, glbRotationY?: number }>} configs
 */
export async function applyCarGltfIfConfigured(carId, car, configs) {
  const url = configs[carId]?.glb;
  if (!url || !car) return false;

  try {
    let root = gltfRoots.get(carId);
    if (!root) {
      root = await loadCarGLB(url);
      gltfRoots.set(carId, root);
    }
    const visualCfg = configs[carId];
    return swapIfValidGltfRoot(car, root, visualCfg);
  } catch {
    return false;
  }
}
