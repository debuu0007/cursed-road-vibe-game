const MIN_SURVIVAL = 0;
const MAX_SURVIVAL = 100;

function clamp(value, min = MIN_SURVIVAL, max = MAX_SURVIVAL) {
  return Math.max(min, Math.min(max, value));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function getStatus(passengerSurvival) {
  if (passengerSurvival > 80) return 'Perfectly Fine';
  if (passengerSurvival > 60) return 'Shaken But Alive';
  if (passengerSurvival > 40) return 'Barely Conscious';
  if (passengerSurvival > 20) return 'Needs Hospital';
  return 'Flatlined';
}

export function resetRunData() {
  return {
    impactForces: [],
    rolloverCount: 0,
    topSpeedAtImpact: 0,
    landingAngles: [],
    cabinDamage: 0,
    distanceSurvived: 0,
    timeAlive: 0,
    airtime: 0
  };
}

export function recordImpact(runData, amount, speedKmh = 0) {
  const impactAmount = Math.max(0, Number(amount) || 0);
  const impactSpeed = Math.max(0, Number(speedKmh) || 0);

  runData.impactForces.push(impactAmount);
  runData.topSpeedAtImpact = Math.max(runData.topSpeedAtImpact || 0, impactSpeed);

  return runData;
}

export function calculateSurvival(runData, goalDistance = 800, carDamage = runData.cabinDamage) {
  const impactForces = Array.isArray(runData.impactForces) ? runData.impactForces : [];
  const landingAngles = Array.isArray(runData.landingAngles) ? runData.landingAngles : [];
  const rolloverCount = Math.max(0, Number(runData.rolloverCount) || 0);
  const distanceSurvived = Math.max(0, Number(runData.distanceSurvived) || 0);
  const cabinDamage = clamp(Number(carDamage) || 0);
  const safeGoalDistance = Math.max(1, Number(goalDistance) || 800);

  const heavyImpactCount = impactForces.filter((force) => force > 50).length;
  const rawSurvival = 100
    - cabinDamage * 0.5
    - rolloverCount * 12
    - sum(landingAngles) * 0.3
    - heavyImpactCount * 8;

  const passengerSurvival = Math.round(clamp(rawSurvival));
  const controlScore = Math.round(clamp((distanceSurvived / safeGoalDistance) * 100));

  return {
    passengerSurvival,
    carDamage: Math.round(cabinDamage),
    controlScore,
    distanceSurvived: Math.round(distanceSurvived),
    status: getStatus(passengerSurvival)
  };
}
