import hatchback from './hatchback.js';
import suv from './suv.js';
import sports from './sports.js';
import truck from './truck.js';
import rickshaw from './rickshaw.js';
import { STORAGE } from '../constants.js';

/** @typedef {typeof hatchback & { lockedUntilFirstRun?: boolean }} CarConfig */

/** @type {Record<string, CarConfig>} */
export const carConfigs = {
  hatchback,
  suv,
  sports,
  truck,
  rickshaw
};

export function isRickshawUnlocked() {
  return localStorage.getItem(STORAGE.hasCompletedRun) === '1';
}

export function markRunCompletedOnce() {
  localStorage.setItem(STORAGE.hasCompletedRun, '1');
}
