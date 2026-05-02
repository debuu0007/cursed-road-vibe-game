import * as THREE from 'three';
import { carveRoadGap } from '../track.js';
import { ROAD_HALF_WIDTH } from '../constants.js';

/** @param {import('./helpers.js').ObstacleCtx} ctx */
export function addGap(ctx, z, size) {
  const { scene, obstacles, roadSegments, world } = ctx;
  const carved = carveRoadGap(roadSegments, world, z, size);
  const visualLength = carved.length + 0.35;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 0.35, 0.08, visualLength),
    new THREE.MeshBasicMaterial({ color: 0x050505 })
  );
  mesh.position.set(0, 0.025, carved.center);
  scene.add(mesh);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x151515 });
  for (const edgeZ of [-visualLength / 2, visualLength / 2]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 0.45, 0.08, 0.22), edgeMat);
    lip.position.set(0, 0.08, edgeZ);
    mesh.add(lip);
  }
  const obstacle = {
    mesh,
    body: null,
    kind: 'gap',
    damage: 0,
    used: false,
    radius: visualLength * 0.52
  };
  obstacles.push(obstacle);
  return obstacle;
}
