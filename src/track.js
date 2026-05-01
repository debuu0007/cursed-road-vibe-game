import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PHYS_MAT } from './physics.js';

/**
 * @typedef {{ group: THREE.Group, body: CANNON.Body, z: number, initialZ: number, isGap: boolean }} RoadSegment
 */

/**
 * @param {THREE.Scene} scene
 * @param {CANNON.World} world
 * @param {RoadSegment[]} roadSegments
 */
export function spawnRoad(scene, world, roadSegments) {
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3d40 });
  const shoulderMat = new THREE.MeshLambertMaterial({ color: 0x2a2e30 });
  const dividerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  
  for (let i = 0; i < 70; i += 1) {
    const z = i * 18;
    const group = new THREE.Group();
    group.position.z = z;
    
    const road = new THREE.Mesh(new THREE.BoxGeometry(8, 0.16, 17.6), roadMat);
    road.position.y = -0.08;
    
    const leftShoulder = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 17.6), shoulderMat);
    leftShoulder.position.set(-5.1, -0.12, 0);
    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x = 5.1;
    
    group.add(road, leftShoulder, rightShoulder);
    
    // Add dividers on both sides randomly (60% chance per segment)
    if (Math.random() > 0.4) {
      const dividerHeight = 0.45;
      const dividerWidth = 0.18;
      const dividerDepth = 16;
      
      // Left divider
      const leftDivider = new THREE.Mesh(
        new THREE.BoxGeometry(dividerWidth, dividerHeight, dividerDepth),
        dividerMat
      );
      leftDivider.position.set(-4.0, dividerHeight / 2 - 0.08, 0);
      
      // Right divider
      const rightDivider = new THREE.Mesh(
        new THREE.BoxGeometry(dividerWidth, dividerHeight, dividerDepth),
        dividerMat
      );
      rightDivider.position.set(4.0, dividerHeight / 2 - 0.08, 0);
      
      group.add(leftDivider, rightDivider);
    }
    
    scene.add(group);

    const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: PHYS_MAT.road });
    body.addShape(new CANNON.Box(new CANNON.Vec3(4, 0.08, 8.8)));
    body.position.set(0, -0.08, z);
    world.addBody(body);
    roadSegments.push({ group, body, z, initialZ: z, isGap: false });
  }
}

/** @param {RoadSegment[]} roadSegments @param {CANNON.World} world */
export function resetRoadSegments(roadSegments, world) {
  for (const segment of roadSegments) {
    segment.isGap = false;
    segment.group.visible = true;
    segment.group.position.z = segment.initialZ;
    segment.body.position.z = segment.initialZ;
    if (!segment.body.world) world.addBody(segment.body);
  }
}

/**
 * @param {RoadSegment[]} roadSegments
 * @param {CANNON.World} world
 */
export function carveRoadGap(roadSegments, world, z, size) {
  for (const segment of roadSegments) {
    if (Math.abs(segment.group.position.z - z) < Math.max(9, size * 1.7)) {
      segment.isGap = true;
      segment.group.visible = false;
      if (segment.body.world) world.removeBody(segment.body);
    }
  }
}

/**
 * @param {RoadSegment[]} roadSegments
 * @param {CANNON.World} world
 */
export function updateRoadStream(roadSegments, carZ, world) {
  if (roadSegments.length === 0) return;
  for (const segment of roadSegments) {
    if (segment.group.position.z < carZ - 90) {
      if (segment.isGap) {
        segment.isGap = false;
        segment.group.visible = true;
        if (!segment.body.world) world.addBody(segment.body);
      }
      segment.group.position.z += roadSegments.length * 18;
      segment.body.position.z = segment.group.position.z;
    }
  }
}
