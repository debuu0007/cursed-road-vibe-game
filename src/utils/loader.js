import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

let dracoLoader = null;

function getDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  }
  return dracoLoader;
}

/**
 * Load a GLB (Draco optional—decoder attached for compressed assets).
 * @param {string} url
 * @returns {Promise<THREE.Group>}
 */
export function loadCarGLB(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(getDracoLoader());
    loader.load(
      url,
      (gltf) => {
        const root = /** @type {THREE.Group} */ (gltf.scene);
        resolve(root);
      },
      undefined,
      (err) => reject(err || new Error(`GLB load failed: ${url}`))
    );
  });
}

/**
 * Scale and center a loaded car so its longest axis roughly matches config scale.
 * @param {THREE.Object3D} root
 * @param {[number, number, number]} scaleTuple
 */
export function fitCarVisualToConfig(root, scaleTuple) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const targetLen = Math.max(scaleTuple[0], scaleTuple[1], scaleTuple[2]);
  const maxSrc = Math.max(size.x, size.y, size.z, 0.001);
  const s = (targetLen / maxSrc) * 0.92;
  root.scale.setScalar(s);
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  const center = box2.getCenter(new THREE.Vector3());
  root.position.sub(center);
}
