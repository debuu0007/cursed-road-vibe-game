export function mulberry32(seed) {
  let state = seed >>> 0;

  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  const input = String(text);
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/** YYYY-M-D in local time — same string for everyone on calendar day */
export function getDailySeedDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Deterministic numeric seed for daily mode layouts */
export function getDailySeed() {
  return hashSeed(`cursed-road-daily-layout:${getDailySeedDateString()}`);
}

export function pickWeighted(random, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return undefined;
  }

  const totalWeight = entries.reduce((total, entry) => {
    return total + Math.max(0, Number(entry.weight) || 0);
  }, 0);

  if (totalWeight <= 0) {
    return entries[0].value;
  }

  let roll = random() * totalWeight;

  for (const entry of entries) {
    roll -= Math.max(0, Number(entry.weight) || 0);
    if (roll <= 0) {
      return entry.value;
    }
  }

  return entries[entries.length - 1].value;
}
