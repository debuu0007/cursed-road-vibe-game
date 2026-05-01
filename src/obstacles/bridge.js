import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { carveRoadGap } from '../track.js';

/**
 * Broken bridge: road carved under deck; plank becomes dynamic after fall delay.
 * @param {import('./helpers.js').ObstacleCtx} ctx
 */
export function addBridge(ctx, z, span = 14) {
  const { scene, world, obstacles, obstacleBodies, roadSegments } = ctx;
  carveRoadGap(roadSegments, world, z, span);

  const voidMesh = new THREE.Mesh(
    new THREE.BoxGeometry(7.95, 0.06, span),
    new THREE.MeshBasicMaterial({ color: 0x050505 })
  );
  voidMesh.position.set(0, 0.02, z);
  scene.add(voidMesh);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(7.55, 0.24, span * 0.9),
    new THREE.MeshLambertMaterial({ color: 0x6b5344 })
  );
  mesh.position.set(0, -0.02, z);
  scene.add(mesh);

  const body = new CANNON.Body({ type: CANNON.Body.STATIC, mass: 0 });
  body.addShape(new CANNON.Box(new CANNON.Vec3(3.78, 0.12, span * 0.45)));
  body.position.copy(mesh.position);
  world.addBody(body);

  const obstacle = {
    mesh,
    voidMesh,
    body,
    kind: 'bridge',
    damage: 1,
    used: false,
    lastHitAt: -99,
    collapseStarted: false,
    collapseElapsed: 0,
    collapsed: false,
    deckHalfDepth: span * 0.45 + 1
  };
  obstacles.push(obstacle);
  obstacleBodies.set(body.id, obstacle);
  return obstacle;
}

/**
 * @param {object} obstacle
 * @param {number} dt
 * @param {CANNON.Body} carBody
 */
export function updateBridgeCollapse(obstacle, dt, carBody) {
  if (obstacle.kind !== 'bridge' || obstacle.collapsed) return false;
  const pos = carBody.position;
  const mp = obstacle.mesh.position;
  const dz = Math.abs(pos.z - mp.z);
  const dx = Math.abs(pos.x - mp.x);
  const halfD = obstacle.deckHalfDepth ?? 10;
  const onDeck = dz < halfD && dx < 3.25;

  if (onDeck) obstacle.collapseStarted = true;
  if (!obstacle.collapseStarted) return false;

  obstacle.collapseElapsed += dt;
  if (obstacle.collapseElapsed < 1.5) return false;

  obstacle.collapsed = true;
  obstacle.body.type = CANNON.Body.DYNAMIC;
  obstacle.body.mass = 580;
  obstacle.body.updateMassProperties();
  obstacle.body.wakeUp();
  return true;
}

/** Sync mesh transform from physics body (bridge plank only). */
export function syncBridgeMesh(obstacle) {
  if (obstacle.kind !== 'bridge' || !obstacle.body || obstacle.body.type !== CANNON.Body.DYNAMIC)
    return;
  obstacle.mesh.position.copy(obstacle.body.position);
  obstacle.mesh.quaternion.copy(obstacle.body.quaternion);
}
