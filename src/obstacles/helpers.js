import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * @typedef {{
 *   scene: THREE.Scene,
 *   world: CANNON.World,
 *   obstacles: object[],
 *   obstacleBodies: Map<number, object>,
 *   roadSegments: object[]
 * }} ObstacleCtx
 */

/**
 * @param {ObstacleCtx} ctx
 * @param {THREE.Mesh} mesh
 */
export function addStaticBox(ctx, mesh, x, y, z, sx, sy, sz, kind, damage = 12) {
  const { scene, world, obstacles, obstacleBodies } = ctx;
  mesh.position.set(x, y, z);
  scene.add(mesh);
  const body = new CANNON.Body({ type: CANNON.Body.STATIC });
  body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
  body.position.set(x, y, z);
  world.addBody(body);
  const obstacle = { mesh, body, kind, damage, used: false, lastHitAt: -99 };
  obstacles.push(obstacle);
  obstacleBodies.set(body.id, obstacle);
  return obstacle;
}
