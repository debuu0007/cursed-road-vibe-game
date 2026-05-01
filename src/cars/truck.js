export default {
  name: 'Truck',
  caption: 'Slow unstoppable boulder',
  mass: 3000,
  speed: 30,
  accel: 16,
  handling: 0.78,
  durability: 1.65,
  stability: 0.88,
  clearance: 0.74,
  color: 0x8b7c6a,
  scale: [2.35, 1.08, 3.72],
  stats: { Speed: 39, Durability: 94, Stability: 71 },
  // Visual: Truck CC-BY KolosStudios (see README); file at public/assets/models/car-truck.glb
  glb: '/assets/models/car-truck.glb',
  /** 90° clockwise as seen from above (+Y) — invert sign if mirrored in your exporter */
  glbRotationY: Math.PI / 2
};
