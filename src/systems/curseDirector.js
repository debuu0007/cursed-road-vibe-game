const DEFAULT_SEED = 0xC012ED;
const ROAD_EDGE_X = 5.8;

const MODE_PROFILES = {
  gauntlet: {
    density: 0.82,
    firstDistance: 90,
    distanceStep: 145,
    wind: 0.9,
    fog: 0.72,
    gravity: 0.78,
    friction: 0.82,
    traffic: 0.64
  },
  shock: {
    density: 1.2,
    firstDistance: 60,
    distanceStep: 92,
    wind: 1.28,
    fog: 0.78,
    gravity: 1,
    friction: 1.18,
    traffic: 1.4
  },
  obstacle: {
    density: 1,
    firstDistance: 70,
    distanceStep: 118,
    wind: 0.82,
    fog: 1,
    gravity: 1.08,
    friction: 1.16,
    traffic: 0.9
  },
  daily: {
    density: 1.08,
    firstDistance: 80,
    distanceStep: 112,
    wind: 1,
    fog: 1.12,
    gravity: 1.14,
    friction: 1.06,
    traffic: 1
  },
  default: {
    density: 1,
    firstDistance: 80,
    distanceStep: 120,
    wind: 1,
    fog: 1,
    gravity: 1,
    friction: 1,
    traffic: 1
  }
};

const CURSE_TYPES = [
  { key: 'wind', weight: 22 },
  { key: 'fog', weight: 18 },
  { key: 'gravityWell', weight: 18 },
  { key: 'frictionZone', weight: 22 },
  { key: 'traffic', weight: 20 }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(input) {
  const text = String(input ?? DEFAULT_SEED);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;

  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(random, entries) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight || 0), 0);
  let roll = random() * total;

  for (const entry of entries) {
    roll -= Math.max(0, entry.weight || 0);
    if (roll <= 0) return entry.key;
  }

  return entries[entries.length - 1]?.key;
}

function round(value, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function makeBaseEvent(type, index, distance, random) {
  return {
    id: `${type}:${index}:${Math.round(distance)}`,
    type,
    index,
    distance: round(distance, 2),
    leadDistance: 34 + random() * 18,
    triggered: false,
    ended: false,
    active: false
  };
}

function makeWind(index, distance, random, profile) {
  const direction = random() > 0.5 ? 1 : -1;
  return {
    ...makeBaseEvent('wind', index, distance, random),
    duration: round((1.15 + random() * 1.4) / Math.max(0.6, profile.wind), 2),
    strength: round(direction * (4.6 + random() * 4.2) * profile.wind, 2),
    turbulence: round(0.16 + random() * 0.3, 3)
  };
}

function makeFog(index, distance, random, profile) {
  return {
    ...makeBaseEvent('fog', index, distance, random),
    duration: round(3.8 + random() * 3.4, 2),
    radius: round((38 + random() * 28) * profile.fog, 2),
    opacity: round(clamp(0.34 + random() * 0.34 * profile.fog, 0.2, 0.82), 3),
    driftX: round((random() - 0.5) * 1.8, 2)
  };
}

function makeGravityWell(index, distance, random, profile) {
  return {
    ...makeBaseEvent('gravityWell', index, distance, random),
    x: round((random() * 2 - 1) * 3.2, 2),
    radius: round(5.2 + random() * 4.6, 2),
    duration: round(2.2 + random() * 2.1, 2),
    strength: round((11 + random() * 12) * profile.gravity, 2),
    pull: random() > 0.28 ? 'inward' : 'updraft'
  };
}

function makeFrictionZone(index, distance, random, profile) {
  const width = 1.8 + random() * 2.4;
  return {
    ...makeBaseEvent('frictionZone', index, distance, random),
    x: round((random() * 2 - 1) * (ROAD_EDGE_X - width * 0.5), 2),
    width: round(width, 2),
    length: round(12 + random() * 18, 2),
    coefficient: round(clamp(0.32 + random() * 0.34 / profile.friction, 0.18, 0.86), 3),
    drag: round((0.4 + random() * 0.55) * profile.friction, 3)
  };
}

function makeTraffic(index, distance, random, profile) {
  return {
    ...makeBaseEvent('traffic', index, distance, random),
    x: round(random() > 0.5 ? 3.05 : -3.05, 2),
    laneOffset: round((random() - 0.5) * 0.8, 2),
    speed: round((18 + random() * 22) * profile.traffic, 2),
    warningDistance: round(70 + random() * 45, 2),
    vehicle: random() > 0.72 ? 'truck' : random() > 0.42 ? 'van' : 'sedan'
  };
}

function makeEvent(type, index, distance, random, profile) {
  if (type === 'wind') return makeWind(index, distance, random, profile);
  if (type === 'fog') return makeFog(index, distance, random, profile);
  if (type === 'gravityWell') return makeGravityWell(index, distance, random, profile);
  if (type === 'frictionZone') return makeFrictionZone(index, distance, random, profile);
  return makeTraffic(index, distance, random, profile);
}

function buildSchedule(modeKey, seed) {
  const profile = MODE_PROFILES[modeKey] || MODE_PROFILES.default;
  const random = mulberry32(hashSeed(`${modeKey}:${seed}`));
  const maxDistance = modeKey === 'shock' ? 1550 : modeKey === 'daily' ? 1280 : 1180;
  const events = [];
  let distance = profile.firstDistance + random() * 30;
  let index = 0;

  while (distance < maxDistance) {
    const spacing = profile.distanceStep * (0.72 + random() * 0.58) / profile.density;
    const type = pickWeighted(random, CURSE_TYPES);
    events.push(makeEvent(type, index, distance, random, profile));

    if (random() < 0.18 * profile.density) {
      const chainedType = pickWeighted(random, CURSE_TYPES.filter((entry) => entry.key !== type));
      events.push(makeEvent(chainedType, index + 1000, distance + 8 + random() * 18, random, profile));
    }

    distance += spacing;
    index += 1;
  }

  return events.sort((a, b) => a.distance - b.distance);
}

function getCarPosition(car) {
  const position = car?.body?.position || car?.position || {};
  return {
    x: Number(position.x) || 0,
    y: Number(position.y) || 0,
    z: Number(position.z) || 0
  };
}

function getDistance(car, state) {
  const distance = Number(state?.distance);
  if (Number.isFinite(distance)) return Math.max(0, distance);
  return Math.max(0, getCarPosition(car).z);
}

function getCallback(callbacks, type) {
  if (!callbacks) return null;
  if (type === 'gravityWell') return callbacks.onGravityWell || null;
  if (type === 'frictionZone') return callbacks.onFrictionZone || null;
  if (type === 'traffic') return callbacks.onTraffic || null;
  if (type === 'wind') return callbacks.onWind || null;
  if (type === 'fog') return callbacks.onFog || null;
  return null;
}

function emit(callbacks, event, phase, director, car, state) {
  const callback = getCallback(callbacks, event.type);
  if (typeof callback !== 'function') return;
  callback({
    ...event,
    phase,
    elapsed: round(director.elapsed, 3),
    distance: round(director.distance, 2),
    carPosition: getCarPosition(car),
    state
  });
}

function emitChain(callbacks, events, director, car, state) {
  if (typeof callbacks?.onChain !== 'function' || events.length < 2) return;
  callbacks.onChain({
    phase: 'start',
    events: events.map((event) => ({ id: event.id, type: event.type, distance: event.distance })),
    elapsed: round(director.elapsed, 3),
    distance: round(director.distance, 2),
    carPosition: getCarPosition(car),
    state
  });
}

/**
 * Creates a deterministic curse scheduler for a run.
 * @param {string} modeKey
 * @param {string|number} seed
 */
export function createCurseDirector(modeKey = 'default', seed = DEFAULT_SEED) {
  const schedule = buildSchedule(modeKey, seed);

  return {
    modeKey,
    seed,
    elapsed: 0,
    distance: 0,
    cursor: 0,
    active: [],
    schedule,
    lastChainAt: -Infinity
  };
}

/**
 * Advances curse timing and emits optional callbacks for new or active events.
 * @param {ReturnType<typeof createCurseDirector>} director
 * @param {object} car
 * @param {object} state
 * @param {number} dt
 * @param {object} callbacks
 */
export function updateCurseDirector(director, car, state = {}, dt = 0, callbacks = {}) {
  if (!director) return null;

  director.elapsed += Math.max(0, Number(dt) || 0);
  director.distance = getDistance(car, state);

  const started = [];
  while (director.cursor < director.schedule.length) {
    const event = director.schedule[director.cursor];
    const triggerDistance = event.distance - (event.type === 'traffic' ? event.warningDistance : event.leadDistance);
    if (director.distance < triggerDistance) break;

    event.triggered = true;
    event.startedAt = director.elapsed;
    event.active = true;
    director.active.push(event);
    director.cursor += 1;
    started.push(event);
    emit(callbacks, event, 'start', director, car, state);
  }

  if (started.length > 1 || (started.length && director.elapsed - director.lastChainAt < 1.75)) {
    const chainEvents = [...director.active].filter((event) => director.elapsed - (event.startedAt || 0) <= 1.75);
    emitChain(callbacks, chainEvents, director, car, state);
    director.lastChainAt = director.elapsed;
  }

  director.active = director.active.filter((event) => {
    const duration = Number(event.duration) || 0;
    const expired = duration > 0 && director.elapsed - (event.startedAt || 0) >= duration;
    const passed = director.distance > event.distance + (event.length || event.radius || 30);

    if (expired || passed) {
      event.active = false;
      event.ended = true;
      emit(callbacks, event, 'end', director, car, state);
      return false;
    }

    emit(callbacks, event, 'update', director, car, state);
    return true;
  });

  return director;
}

export function resetCurseDirector(director) {
  if (!director) return null;

  director.elapsed = 0;
  director.distance = 0;
  director.cursor = 0;
  director.active = [];
  director.lastChainAt = -Infinity;

  for (const event of director.schedule) {
    event.triggered = false;
    event.ended = false;
    event.active = false;
    delete event.startedAt;
  }

  return director;
}
