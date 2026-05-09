import * as THREE from 'three';

/**
 * Warm beams + wide road fill in local car space (+Z forward, Y up).
 * @param {{ mesh: THREE.Object3D, config: { scale: number[] } }} car
 */
export function attachCarHeadlights(car) {
  if (!car?.mesh || car.headlampGroup) return;

  const [w, h, l] = car.config.scale;
  const g = new THREE.Group();
  g.name = 'carHeadlights';
  g.userData.preserveDuringGltfSwap = true;

  const fz = l * 0.46;

  function addSpot(side) {
    const spot = new THREE.SpotLight(0xfff6ee, 0, 72, 0.52, 0.4, 1.1);
    spot.castShadow = false;
    spot.position.set(side * w * 0.36, h * 0.1, fz);
    spot.target.position.set(side * w * 0.28, -0.04, fz + 34);
    g.add(spot);
    g.add(spot.target);
    return spot;
  }

  car.headSpotL = addSpot(-1);
  car.headSpotR = addSpot(1);

  const fill = new THREE.SpotLight(0xfffaee, 0, 85, 0.72, 0.52, 1.05);
  fill.castShadow = false;
  fill.position.set(0, h * 0.04, fz + l * 0.04);
  fill.target.position.set(0, -1.2, fz + 42);
  g.add(fill);
  g.add(fill.target);
  car.headSpotFill = fill;

  car.headlampGroup = g;
  car.mesh.add(g);
}

/**
 * @param {{ headSpotL?: THREE.SpotLight; headSpotR?: THREE.SpotLight; headSpotFill?: THREE.SpotLight } | null} car
 * @param {number} nightFactor 0..1 from dynamic sky
 */
export function updateHeadlightIntensity(car, nightFactor) {
  if (!car?.headSpotL || !car?.headSpotR) return;
  const nf = THREE.MathUtils.clamp(nightFactor, 0, 1);
  const on = nf > 0.04;
  const beam = nf * 26;
  const fill = nf * 18;
  car.headSpotL.intensity = beam;
  car.headSpotR.intensity = beam;
  car.headSpotL.visible = on;
  car.headSpotR.visible = on;
  if (car.headSpotFill) {
    car.headSpotFill.intensity = fill;
    car.headSpotFill.visible = on;
  }
}
