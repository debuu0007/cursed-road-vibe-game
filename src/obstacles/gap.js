import * as THREE from 'three';
import { carveRoadGap } from '../track.js';

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addGap(ctx, z, size) {
  const { scene, obstacles, roadSegments, world } = ctx;
  carveRoadGap(roadSegments, world, z, size);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(7.95, 0.06, size),
    new THREE.MeshBasicMaterial({ color: 0x050505 })
  );
  mesh.position.set(0, 0.02, z);
  scene.add(mesh);
  const obstacle = { mesh, body: null, kind: 'gap', damage: 0, used: false, radius: size * 0.7 };
  obstacles.push(obstacle);
  return obstacle;
}
