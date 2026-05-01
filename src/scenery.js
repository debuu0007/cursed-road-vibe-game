import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * @param {THREE.Scene} scene
 * @param {CANNON.World} world
 * @param {{ trunk: THREE.Mesh, top: THREE.Mesh, body: CANNON.Body }[]} trees
 * @param {Map<number, object>} obstacleBodies
 */
export function createScenery(scene, world, trees, obstacleBodies) {
  // Grass ground on both sides
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x4a7c3a, fog: true });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 2200, 1, 1),
    grassMat
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 700;
  ground.position.y = -0.045;
  scene.add(ground);

  for (const side of [-1, 1]) {
    const offroad = new CANNON.Body({ type: CANNON.Body.STATIC });
    offroad.addShape(new CANNON.Box(new CANNON.Vec3(16, 0.08, 1100)));
    offroad.position.set(side * 22, -0.1, 700);
    world.addBody(offroad);
  }

  const treeGeo = new THREE.ConeGeometry(0.85, 3.5, 4);
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x2d5a2d, fog: true });
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.2, 4);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6f4a2e, fog: true });
  for (let i = 0; i < 90; i += 1) {
    const z = i * 18 + Math.random() * 10 - 40;
    for (const side of [-1, 1]) {
      if (Math.random() < 0.35) continue;
      const x = side * (9 + Math.random() * 17);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 0.55, z);
      const top = new THREE.Mesh(treeGeo, treeMat);
      top.position.set(x, 2.45, z);
      scene.add(trunk, top);
      const body = new CANNON.Body({ type: CANNON.Body.STATIC });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.42, 0.9, 0.42)));
      body.position.set(x, 0.55, z);
      world.addBody(body);
      obstacleBodies.set(body.id, {
        mesh: trunk,
        body,
        kind: 'tree',
        damage: 9,
        used: false,
        lastHitAt: -99,
        scenery: true
      });
      trees.push({ trunk, top, body });
    }
  }
}
