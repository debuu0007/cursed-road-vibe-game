import { mulberry32, pickWeighted } from '../systems/trackSeed.js';
import { addDivider } from './divider.js';
import { addBump } from './bump.js';
import { addRamp } from './ramp.js';
import { addOil } from './oilPatch.js';
import { addGap } from './gap.js';
import { addBridge } from './bridge.js';

/**
 * @param {import('./helpers.js').ObstacleCtx} ctx
 * @param {number} seed
 * @param {string} modeKey
 */
export function spawnObstaclesForMode(ctx, modeKey, seed) {
  const random = mulberry32(seed);

  if (modeKey === 'gauntlet') {
    [90, 165, 255, 365, 500, 610].forEach((z, index) => {
      addGap(ctx, z, 3.8 + index * 0.35);
      addRamp(ctx, z - 24, index % 2 ? -1.5 : 1.4);
    });
    for (let z = 80; z < 650; z += 70) addBump(ctx, z + 22, random() * 4 - 2);
    addBridge(ctx, 298);
  }

  if (modeKey === 'shock') {
    for (let z = 80; z < 1500; z += 32) {
      if (random() < 0.72) addDivider(ctx, random() > 0.5 ? -3.05 : 3.05, z);
      if (random() < 0.35) addOil(ctx, random() * 3.8 - 1.9, z + 14);
    }
  }

  if (modeKey === 'obstacle' || modeKey === 'daily') {
    const zMax = modeKey === 'daily' ? 900 : 760;
    for (let z = 60; z < zMax; z += 34) {
      const kind = pickWeighted(random, [
        { value: 'oil', weight: 28 },
        { value: 'ramp', weight: 24 },
        { value: 'divider', weight: 24 },
        { value: 'bump', weight: 24 }
      ]);
      const x = random() * 5.2 - 2.6;
      if (kind === 'oil') addOil(ctx, x, z);
      else if (kind === 'ramp') addRamp(ctx, z, x);
      else if (kind === 'divider') addDivider(ctx, x, z);
      else addBump(ctx, z, x);
    }
    const gapZs = modeKey === 'daily' ? [220, 480, 720] : [190, 430, 620];
    const gapSz = modeKey === 'daily' ? 3.2 : 2.8;
    gapZs.forEach((z) => addGap(ctx, z, gapSz));

    if (modeKey === 'daily') addBridge(ctx, 360, 13);
  }
}
