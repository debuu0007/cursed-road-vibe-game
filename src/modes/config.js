/** @typedef {{ name: string, goal: string, distanceGoal: number, durationGoal: number | null, seedKey?: string | null }} ModeConfig */

/** @type {Record<string, ModeConfig>} */
export const modeConfigs = {
  gauntlet: {
    name: 'Pothole Gauntlet',
    goal: 'Reach 1300m',
    distanceGoal: 1300,
    durationGoal: null,
    seedKey: null
  },
  shock: {
    name: 'Speed Shock',
    goal: 'Survive 120s',
    distanceGoal: 2200,
    durationGoal: 120,
    seedKey: null
  },
  obstacle: {
    name: 'Obstacle Road',
    goal: 'Cover 1500m',
    distanceGoal: 1500,
    durationGoal: null,
    seedKey: null
  },
  daily: {
    name: 'Daily Challenge',
    goal: 'Reach 1600m (same seed all day)',
    distanceGoal: 1600,
    durationGoal: null,
    seedKey: 'daily'
  }
};
