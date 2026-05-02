import { mulberry32, pickWeighted } from '../systems/trackSeed.js';
import { addDivider } from './divider.js';
import { addBump } from './bump.js';
import { addRamp } from './ramp.js';
import { addOil } from './oilPatch.js';
import { addGap } from './gap.js';
import { addBridge } from './bridge.js';
import {
  addFogPatch,
  addFrictionZone,
  addGravityWell,
  addSlipstream,
  addTraffic,
  addWindGust
} from './curseHazards.js';
import { addRepairPad } from './repairPad.js';

function laneX(random, roadHalfWidth = 6) {
  return random() * (roadHalfWidth * 1.45) - roadHalfWidth * 0.725;
}

/**
 * @param {import('./helpers.js').ObstacleCtx} ctx
 * @param {number} seed
 * @param {string} modeKey
 */
export function spawnObstaclesForMode(ctx, modeKey, seed) {
  const random = mulberry32(seed);

  if (modeKey === 'gauntlet') {
    [150, 285, 450, 650, 890, 1120].forEach((z, index) => {
      addGap(ctx, z, 3.8 + index * 0.35);
      addRamp(ctx, z - 24, index % 2 ? -1.5 : 1.4);
    });
    for (let z = 105; z < 1350; z += 145) addBump(ctx, z + 22, laneX(random));
    addBridge(ctx, 540);
    addWindGust(ctx, 360, -1);
    addGravityWell(ctx, -2.1, 760);
    addFrictionZone(ctx, 2.2, 1010, 'ice');
    addRepairPad(ctx, 1.8, 540);
    // Extended obstacles to cover 1000m goal + buffer
    if (random() < 0.6) addDivider(ctx, random() > 0.5 ? -4.8 : 4.8, 1240);
  }

  if (modeKey === 'shock') {
    for (let z = 130; z < 6000; z += 72) {
      if (random() < 0.46) addDivider(ctx, random() > 0.5 ? -4.8 : 4.8, z);
      if (random() < 0.18) addOil(ctx, laneX(random), z + 26);
      if (z % 360 === 130) addWindGust(ctx, z + 46, random() > 0.5 ? 1 : -1);
      if (z % 504 === 274) addTraffic(ctx, random() > 0.5 ? -2.3 : 2.3, z + 88, 48 + random() * 10);
      if (z % 432 === 202) addSlipstream(ctx, laneX(random, 4), z + 54);
      if (z % 648 === 346) addGravityWell(ctx, laneX(random, 4), z + 62);
      if (z % 576 === 418) addFogPatch(ctx, z + 72, 16);
      if (z > 250 && z % 792 === 466) addRepairPad(ctx, laneX(random, 4), z + 80);
    }
  }

  if (modeKey === 'obstacle' || modeKey === 'daily') {
    const zMax = modeKey === 'daily' ? 1800 : 1650;
    for (let z = 90; z < zMax; z += 82) {
      const kind = pickWeighted(random, [
        { value: 'oil', weight: 28 },
        { value: 'ramp', weight: 24 },
        { value: 'divider', weight: 24 },
        { value: 'bump', weight: 24 }
      ]);
      const x = laneX(random);
      if (kind === 'oil') addOil(ctx, x, z);
      else if (kind === 'ramp') addRamp(ctx, z, x);
      else if (kind === 'divider') addDivider(ctx, x, z);
      else addBump(ctx, z, x);
      if (z % 328 === 172) addFogPatch(ctx, z + 42, 16);
      if (z % 410 === 254) addFrictionZone(ctx, laneX(random, 4.5), z + 34, random() > 0.5 ? 'ice' : 'gravel');
      if (z % 492 === 336) addGravityWell(ctx, laneX(random, 4), z + 45);
      if (z > 160 && z % 616 === 370) addRepairPad(ctx, laneX(random, 4), z + 50);
    }
    const gapZs = modeKey === 'daily' ? [330, 760, 1190, 1520] : [300, 720, 1160, 1450];
    const gapSz = modeKey === 'daily' ? 3.2 : 2.8;
    gapZs.forEach((z) => addGap(ctx, z, gapSz));

    if (modeKey === 'daily') addBridge(ctx, 640, 13);
    if (modeKey === 'daily') addTraffic(ctx, -2.3, 1040, 54);
  }
}
