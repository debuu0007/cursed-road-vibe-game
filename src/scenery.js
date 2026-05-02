import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * @param {THREE.Scene} scene
 * @param {CANNON.World} world
 * @param {{ trunk: THREE.Mesh, top: THREE.Mesh, body: CANNON.Body }[]} trees
 * @param {Map<number, object>} obstacleBodies
 */
export function createScenery(scene, world, trees, obstacleBodies) {
  // Grass ground on both sides (extended to 8000m to cover Speed Shock long runs + buffer)
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x4a7c3a, fog: true });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 8000, 1, 1),
    grassMat
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 4000;
  ground.position.y = -0.045;
  scene.add(ground);

  for (const side of [-1, 1]) {
    const offroad = new CANNON.Body({ type: CANNON.Body.STATIC });
    offroad.addShape(new CANNON.Box(new CANNON.Vec3(16, 0.08, 4000)));
    offroad.position.set(side * 22, -0.1, 4000);
    world.addBody(offroad);
  }

  const treeGeo = new THREE.ConeGeometry(0.85, 3.5, 4);
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x2d5a2d, fog: true });
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.2, 4);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6f4a2e, fog: true });
  
  // Roadside props materials
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x6d6d6d, fog: true });
  const bushMat = new THREE.MeshLambertMaterial({ color: 0x3a5a2e, fog: true });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x8a8a8a, fog: true });
  
  for (let i = 0; i < 90; i += 1) {
    const z = i * 18 + Math.random() * 10 - 40;
    for (const side of [-1, 1]) {
      // Trees
      if (Math.random() < 0.35) continue;
      const x = side * (13 + Math.random() * 15);
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
      
      // Roadside props (rocks, bushes, posts)
      if (Math.random() < 0.25) {
        const propX = side * (9 + Math.random() * 3);
        const propZ = z + Math.random() * 8 - 4;
        const propType = Math.random();
        
        if (propType < 0.4) {
          // Rocks
          const rock = new THREE.Mesh(
            new THREE.SphereGeometry(0.25 + Math.random() * 0.15, 5, 4),
            rockMat
          );
          rock.position.set(propX, 0.15, propZ);
          rock.scale.y = 0.6 + Math.random() * 0.3;
          scene.add(rock);
        } else if (propType < 0.7) {
          // Bushes
          const bush = new THREE.Mesh(
            new THREE.SphereGeometry(0.35 + Math.random() * 0.2, 6, 5),
            bushMat
          );
          bush.position.set(propX, 0.25, propZ);
          bush.scale.y = 0.7;
          scene.add(bush);
        } else {
          // Small posts
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6),
            postMat
          );
          post.position.set(propX, 0.4, propZ);
          scene.add(post);
        }
      }
    }
  }
  
  // Distance markers every 500m
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const markerPostMat = new THREE.MeshLambertMaterial({ color: 0x444444, fog: true });
  for (let dist = 500; dist <= 6000; dist += 500) {
    for (const side of [-1, 1]) {
      const markerGroup = new THREE.Group();
      
      // Post
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8),
        markerPostMat
      );
      post.position.y = 1.25;
      markerGroup.add(post);
      
      // Sign board
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.9, 0.08),
        markerMat
      );
      board.position.y = 2.2;
      markerGroup.add(board);
      
      // Text canvas
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${dist}m`, 128, 64);
      
      const texture = new THREE.CanvasTexture(canvas);
      const textMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 0.85),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true })
      );
      textMesh.position.set(0, 2.2, side > 0 ? -0.05 : 0.05);
      textMesh.rotation.y = side > 0 ? 0 : Math.PI;
      markerGroup.add(textMesh);
      
      markerGroup.position.set(side * 8.5, 0, dist);
      scene.add(markerGroup);
    }
  }
}
