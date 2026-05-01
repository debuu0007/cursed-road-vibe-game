/** @typedef {{ name: string, goal: string, distanceGoal: number, durationGoal: number | null, seedKey?: string | null }} ModeConfig */

/** @type {Record<string, ModeConfig>} */
export const modeConfigs = {
  gauntlet: {
    name: 'Pothole Gauntlet',
    goal: 'Reach 1000m',
    distanceGoal: 1000,
    durationGoal: null,
    seedKey: null
  },
  shock: {
    name: 'Speed Shock',
    goal: 'Survive 90s',
    distanceGoal: 1450,
    durationGoal: 90,
    seedKey: null
  },
  obstacle: {
    name: 'Obstacle Road',
    goal: 'Cover 1100m',
    distanceGoal: 1100,
    durationGoal: null,
    seedKey: null
  },
  daily: {
    name: 'Daily Challenge',
    goal: 'Reach 1200m (same seed all day)',
    distanceGoal: 1200,
    durationGoal: null,
    seedKey: 'daily'
  }
};
