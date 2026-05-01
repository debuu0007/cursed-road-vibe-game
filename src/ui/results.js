import { STORAGE } from '../constants.js';
import { getDailySeedDateString } from '../systems/trackSeed.js';

export function showResultsPanel(args) {
  const {
    resultsEl,
    resultCardEl,
    won,
    reason,
    result,
    bestAllTime,
    selectedMode,
    dailyBest,
    repairs = 0
  } = args;
  const title = won ? 'ROAD SURVIVED' : 'RUN OVER';

  /** @type {string[]} */
  const lines = [
    '+--------------------------------+',
    `|   CURSED ROAD - ${title.padEnd(13)}|`,
    '+--------------------------------+',
    `| Car Damage:     ${String(result.carDamage).padStart(3)}%           |`,
    `| Passenger:      ${String(result.passengerSurvival).padStart(3)}%           |`,
    `| Control Score:  ${String(result.controlScore).padStart(3)}/100       |`,
    `| Distance:       ${String(Math.round(result.distanceSurvived)).padStart(4)}m          |`,
    `| Best (all):     ${String(bestAllTime).padStart(4)}m          |`
  ];

  if (selectedMode === 'daily') {
    const d = getDailySeedDateString();
    lines.push(`| Today's best:   ${String(dailyBest).padStart(4)}m (${d.slice(0, 15)})|`);
  }

  if (repairs > 0) lines.push(`| Field repairs:  ${String(repairs).padStart(3)}             |`);

  lines.push(
    `| Cause: ${reason.slice(0, 23).padEnd(23)}|`,
    `| Status: ${result.status.padEnd(22)}|`,
    '+--------------------------------+'
  );

  resultCardEl.textContent = lines.join('\n');
  resultsEl.classList.add('is-visible');
}

export function formatShareText(carName, result, opts = {}) {
  const base = `I survived ${Math.round(result.distanceSurvived)}m in a ${carName} on Cursed Road. Passenger: ${result.passengerSurvival}% alive.`;
  const daily = opts.dailyDate ? ` Daily challenge ${opts.dailyDate}.` : '';
  return `${base}${daily} Can you beat it?`;
}

/** @returns {{ bestAllTime: number, dailyBest: number }} */
export function persistScores(selectedMode, result) {
  const dist = Math.round(result.distanceSurvived);
  const prev = Number(localStorage.getItem(STORAGE.bestDistance) || 0);
  const bestAllTime = Math.max(prev, dist);
  localStorage.setItem(STORAGE.bestDistance, String(bestAllTime));

  const dailyKey = STORAGE.dailyPrefix + getDailySeedDateString();
  const prevDaily = Number(localStorage.getItem(dailyKey) || 0);
  let dailyBest = prevDaily;

  if (selectedMode === 'daily') {
    dailyBest = Math.max(prevDaily, dist);
    localStorage.setItem(dailyKey, String(dailyBest));
  }

  return { bestAllTime, dailyBest };
}
