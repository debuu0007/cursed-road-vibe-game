import * as THREE from 'three';

/** @param {HTMLCanvasElement} canvas */
export function createSceneCameraRenderer(canvas, width, height) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 50, 350);

  const camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 900);
  camera.position.set(0, 5.5, -9);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = false;

  return { scene, camera, renderer };
}

/** @param {THREE.WebGLRenderer} renderer */
export function resizeRenderer(renderer, camera, width, height) {
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
