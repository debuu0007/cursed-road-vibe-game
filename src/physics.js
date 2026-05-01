import * as CANNON from 'cannon-es';

export const PHYS_MAT = {
  road: new CANNON.Material('road'),
  car: new CANNON.Material('car')
};

/** @returns {CANNON.World} */
export function createWorld() {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -18, 0),
    allowSleep: true
  });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.defaultContactMaterial.friction = 0.68;
  world.defaultContactMaterial.restitution = 0;
  world.addContactMaterial(
    new CANNON.ContactMaterial(PHYS_MAT.car, PHYS_MAT.road, {
      friction: 1.15,
      restitution: 0,
      contactEquationStiffness: 1.8e8,
      contactEquationRelaxation: 2.8
    })
  );
  return world;
}
