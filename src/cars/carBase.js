import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PHYS_MAT } from '../physics.js';

/** Procedural placeholder mesh (until GLB swap). */
export function makeCarMesh(config) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({
    color: config.color
  });
  const dark = new THREE.MeshBasicMaterial({ color: 0x101214 });
  const glass = new THREE.MeshBasicMaterial({ color: 0xa9d8e8 });
  const [w, h, l] = config.scale;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), bodyMat);
  chassis.position.y = 0;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.72, l * 0.45), glass);
  cabin.position.set(0, h * 0.68, -0.14);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, h * 0.38, l * 0.34), bodyMat);
  nose.position.set(0, h * 0.04, l * 0.34);
  group.add(chassis, cabin, nose);

  for (const x of [-w * 0.55, w * 0.55]) {
    for (const z of [-l * 0.32, l * 0.32]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.32, 12), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, -h * 0.5 + 0.18, z);
      group.add(wheel);
    }
  }

  return group;
}

/** @param {object} config */
export function createCarBody(config) {
  const shape = new CANNON.Box(
    new CANNON.Vec3(config.scale[0] / 2, config.scale[1] / 2, config.scale[2] / 2)
  );
  const body = new CANNON.Body({
    mass: config.mass,
    linearDamping: 0.22,
    angularDamping: 0.98,
    material: PHYS_MAT.car
  });
  body.addShape(shape);
  body.position.set(0, config.scale[1] / 2 + 0.16, 1);
  body.quaternion.setFromEuler(0, 0, 0);
  body.angularFactor.set(0.16, 1, 0.12);
  body.allowSleep = false;
  return body;
}
