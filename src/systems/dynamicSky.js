import * as THREE from 'three';

/** Full day-night length in seconds (wall clock; menu + gameplay). */
const DAY_LENGTH_SEC = 260;

const SKY_RADIUS = 520;

const _sunDir = new THREE.Vector3();
const _scratchColor = new THREE.Color();
const _cA = new THREE.Color();
const _cB = new THREE.Color();

/**
 * @typedef {object} CycleKeyframe
 * @property {number} u — 0..1 along day cycle
 * @property {number} zenith
 * @property {number} horizon
 * @property {number} groundHaze
 * @property {number} hemiSky
 * @property {number} hemiGround
 * @property {number} sunColor
 * @property {number} sunIntensity
 * @property {number} hemiIntensity
 * @property {number} fogNear
 * @property {number} fogFar
 */

/** Seamless loop: first and last match night. */
const KEYFRAMES = /** @type {CycleKeyframe[]} */ ([
  {
    u: 0,
    zenith: 0x4a4878,
    horizon: 0x565a82,
    groundHaze: 0x383848,
    hemiSky: 0x5c5a8a,
    hemiGround: 0x243030,
    sunColor: 0xb8c8e8,
    sunIntensity: 0.52,
    hemiIntensity: 0.88,
    fogNear: 90,
    fogFar: 1180
  },
  {
    u: 0.1,
    zenith: 0x6b5a9e,
    horizon: 0xff8a5c,
    groundHaze: 0x6b4030,
    hemiSky: 0xffc8a0,
    hemiGround: 0x5a4838,
    sunColor: 0xffecd0,
    sunIntensity: 1.35,
    hemiIntensity: 1.15,
    fogNear: 78,
    fogFar: 1080
  },
  {
    u: 0.28,
    zenith: 0x5c9fd8,
    horizon: 0xa8d8f0,
    groundHaze: 0x6a8a68,
    hemiSky: 0x92c8f8,
    hemiGround: 0x4a7c3a,
    sunColor: 0xffffff,
    sunIntensity: 1.72,
    hemiIntensity: 1.38,
    fogNear: 82,
    fogFar: 1180
  },
  {
    u: 0.42,
    zenith: 0x5088cc,
    horizon: 0xf0b880,
    groundHaze: 0x7a9070,
    hemiSky: 0xe0c8a8,
    hemiGround: 0x527848,
    sunColor: 0xffe8cc,
    sunIntensity: 1.45,
    hemiIntensity: 1.22,
    fogNear: 80,
    fogFar: 1160
  },
  {
    u: 0.52,
    zenith: 0x483878,
    horizon: 0xff6b35,
    groundHaze: 0x5a3840,
    hemiSky: 0xffa888,
    hemiGround: 0x4a3828,
    sunColor: 0xffaa66,
    sunIntensity: 1.05,
    hemiIntensity: 0.95,
    fogNear: 74,
    fogFar: 1020
  },
  {
    u: 0.62,
    zenith: 0x302868,
    horizon: 0xc84888,
    groundHaze: 0x301828,
    hemiSky: 0x8868a8,
    hemiGround: 0x281418,
    sunColor: 0xcc8866,
    sunIntensity: 0.35,
    hemiIntensity: 0.55,
    fogNear: 68,
    fogFar: 920
  },
  {
    u: 0.78,
    zenith: 0x3c4870,
    horizon: 0x4a5078,
    groundHaze: 0x323045,
    hemiSky: 0x505080,
    hemiGround: 0x202828,
    sunColor: 0x98b0c8,
    sunIntensity: 0.48,
    hemiIntensity: 0.82,
    fogNear: 85,
    fogFar: 1120
  },
  {
    u: 1,
    zenith: 0x4a4878,
    horizon: 0x565a82,
    groundHaze: 0x383848,
    hemiSky: 0x5c5a8a,
    hemiGround: 0x243030,
    sunColor: 0xb8c8e8,
    sunIntensity: 0.52,
    hemiIntensity: 0.88,
    fogNear: 90,
    fogFar: 1180
  }
]);

function sampleKeyframes(cycleT, out) {
  const t = cycleT % 1;
  let i = 0;
  while (i < KEYFRAMES.length - 1 && t >= KEYFRAMES[i + 1].u) i += 1;
  const a = KEYFRAMES[i];
  const b = KEYFRAMES[Math.min(i + 1, KEYFRAMES.length - 1)];
  const span = b.u - a.u || 1e-6;
  const k = THREE.MathUtils.clamp((t - a.u) / span, 0, 1);
  const smooth = k * k * (3 - 2 * k);

  _cA.setHex(a.zenith);
  _cB.setHex(b.zenith);
  out.zenith.copy(_cA).lerp(_cB, smooth);

  _cA.setHex(a.horizon);
  _cB.setHex(b.horizon);
  out.horizon.copy(_cA).lerp(_cB, smooth);

  _cA.setHex(a.groundHaze);
  _cB.setHex(b.groundHaze);
  out.groundHaze.copy(_cA).lerp(_cB, smooth);

  _cA.setHex(a.hemiSky);
  _cB.setHex(b.hemiSky);
  out.hemiSky.copy(_cA).lerp(_cB, smooth);

  _cA.setHex(a.hemiGround);
  _cB.setHex(b.hemiGround);
  out.hemiGround.copy(_cA).lerp(_cB, smooth);

  _cA.setHex(a.sunColor);
  _cB.setHex(b.sunColor);
  out.sunColor.copy(_cA).lerp(_cB, smooth);

  out.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, smooth);
  out.hemiIntensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, smooth);
  out.fogNear = THREE.MathUtils.lerp(a.fogNear, b.fogNear, smooth);
  out.fogFar = THREE.MathUtils.lerp(a.fogFar, b.fogFar, smooth);
}

function nightFactorForLightning(cycleT) {
  const t = cycleT % 1;
  if (t <= 0.14)
    return THREE.MathUtils.smoothstep((0.14 - t) / 0.14, 0, 1);
  if (t >= 0.66) return THREE.MathUtils.smoothstep((t - 0.66) / 0.34, 0, 1);
  if (t >= 0.55 && t <= 0.66) return 1 - THREE.MathUtils.smoothstep((t - 0.55) / 0.11, 0, 1);
  return 0;
}

function buildBoltGeometry() {
  const segs = 6 + Math.floor(Math.random() * 4);
  const positions = new Float32Array((segs + 1) * 3);
  let x = 0;
  let y = 90 + Math.random() * 70;
  let z = 140 + Math.random() * 120;
  for (let i = 0; i <= segs; i += 1) {
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    x += (Math.random() - 0.5) * 28;
    y -= 22 + Math.random() * 18;
    z += (Math.random() - 0.5) * 14;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geo;
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ hemi: THREE.HemisphereLight, sun: THREE.DirectionalLight, fog: THREE.Fog }} env
 */
export function createDynamicSky(scene, camera, env) {
  const { hemi, sun, fog } = env;

  const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 32, 24);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(0x87ceeb) },
      uHorizon: { value: new THREE.Color(0xb0d8f0) },
      uGround: { value: new THREE.Color(0x4a7c3a) },
      uNight: { value: 0 }
    },
    side: THREE.BackSide,
    depthWrite: false,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform float uNight;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.62, h));
        col = mix(uGround, col, smoothstep(-0.42, 0.12, h));
        if (uNight > 0.02 && h > 0.08) {
          float streak = fract(sin(dot(dir.xz, vec2(12.9898, 78.233)) + dir.y * 31.415) * 43758.5453);
          float star = step(0.985, streak) * smoothstep(0.25, 0.85, h);
          col += vec3(star * uNight * 1.35);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vDir = w.xyz - cameraPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `
  });
  skyMat.toneMapped = false;

  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.name = 'dynamicSkyDome';
  skyMesh.renderOrder = -1000;
  scene.add(skyMesh);

  const lightningGroup = new THREE.Group();
  lightningGroup.name = 'lightningBolt';
  lightningGroup.visible = false;
  scene.add(lightningGroup);

  let boltLine = /** @type {THREE.Line | null} */ (null);
  const flash = new THREE.PointLight(0xb8d8ff, 0, 420, 1.2);
  flash.name = 'lightningFlash';
  flash.visible = false;
  scene.add(flash);

  let skyElapsed = 0;
  let lightningCooldown = 1.2 + Math.random() * 2.5;
  let lightningFlashT = 0;
  let baseSunIntensity = 1;
  /** 0 = day, 1 = headlights / car night VFX (slightly earlier than full star field). */
  let lastHeadlightFactor = 0;
  const _flashPos = new THREE.Vector3();

  const sampled = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    groundHaze: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    sunColor: new THREE.Color(),
    sunIntensity: 1,
    hemiIntensity: 1,
    fogNear: 80,
    fogFar: 1200
  };

  function clearBolt() {
    if (boltLine) {
      lightningGroup.remove(boltLine);
      boltLine.geometry.dispose();
      /** @type {THREE.LineBasicMaterial} */ (boltLine.material).dispose();
      boltLine = null;
    }
  }

  function spawnBolt(camPos) {
    clearBolt();
    const geo = buildBoltGeometry();
    const mat = new THREE.LineBasicMaterial({
      color: 0xccddff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    boltLine = new THREE.Line(geo, mat);
    lightningGroup.add(boltLine);

    const ox = (Math.random() - 0.5) * 100;
    const oz = 160 + Math.random() * 140;
    lightningGroup.position.set(camPos.x + ox, 0, camPos.z + oz);
    lightningGroup.visible = true;
  }

  function updateSunPose(camPos, cycleT) {
    const phase = cycleT * Math.PI * 2 - Math.PI * 0.42;
    const elev = Math.sin(phase) * (Math.PI / 2 - 0.12);
    const azim = phase * 0.72 + 0.85;
    const ce = Math.cos(elev);
    _sunDir.set(ce * Math.cos(azim), Math.sin(elev), ce * Math.sin(azim)).normalize();

    const target = camPos;
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
    sun.position.copy(target).addScaledVector(_sunDir, 220);
    sun.updateMatrixWorld();
  }

  return {
    update(dt) {
      if (!camera || !scene) return;
      skyElapsed += dt;
      const cycleT = (skyElapsed / DAY_LENGTH_SEC) % 1;

      sampleKeyframes(cycleT, sampled);

      skyMesh.position.copy(camera.position);

      skyMat.uniforms.uZenith.value.copy(sampled.zenith);
      skyMat.uniforms.uHorizon.value.copy(sampled.horizon);
      skyMat.uniforms.uGround.value.copy(sampled.groundHaze);

      scene.background = _scratchColor.copy(sampled.horizon);
      fog.color.copy(sampled.horizon);
      fog.near = sampled.fogNear;
      fog.far = sampled.fogFar;

      hemi.color.copy(sampled.hemiSky);
      hemi.groundColor.copy(sampled.hemiGround);
      hemi.intensity = sampled.hemiIntensity;

      updateSunPose(camera.position, cycleT);
      sun.color.copy(sampled.sunColor);
      baseSunIntensity = sampled.sunIntensity;

      const sunH = _sunDir.y;
      /** `smoothstep(sunH, high, low)` is wrong (min>max) — was forcing 0 at night. */
      skyMat.uniforms.uNight.value = THREE.MathUtils.smoothstep(-sunH, 0.02, 0.36);
      lastHeadlightFactor = THREE.MathUtils.smoothstep(-sunH, 0.06, 0.34);

      /** Lightning */
      const storm = nightFactorForLightning(cycleT);
      lightningCooldown -= dt;
      if (lightningFlashT > 0) {
        lightningFlashT -= dt;
        const p = THREE.MathUtils.clamp(lightningFlashT / 0.11, 0, 1);
        const flashEase = p * p;
        flash.intensity = 3.8 * flashEase * flashEase;
        sun.intensity = baseSunIntensity + 6.5 * flashEase;
        if (boltLine && boltLine.material.opacity != null) {
          boltLine.material.opacity = 0.92 * Math.min(1, lightningFlashT / 0.07);
        }
        flash.position.copy(_flashPos);
        if (lightningFlashT <= 0) {
          flash.visible = false;
          flash.intensity = 0;
          sun.intensity = baseSunIntensity;
          lightningGroup.visible = false;
          clearBolt();
        }
      } else if (storm > 0.15 && lightningCooldown <= 0) {
        const chance = storm * 0.42 * dt;
        if (Math.random() < chance) {
          spawnBolt(camera.position);
          lightningFlashT = 0.14 + Math.random() * 0.06;
          flash.visible = true;
          flash.intensity = 4.2;
          _flashPos.copy(camera.position).add(0, 85 + Math.random() * 35, 130 + Math.random() * 90);
          lightningCooldown = 0.55 + Math.random() * 2.8 * (1.35 - storm);
        } else if (lightningCooldown <= -2) {
          lightningCooldown = 0.4 + Math.random() * 1.2;
        }
      }

      if (lightningFlashT <= 0) sun.intensity = baseSunIntensity;
    },

    getHeadlightFactor() {
      return lastHeadlightFactor;
    },

    dispose() {
      scene.remove(skyMesh);
      skyGeo.dispose();
      skyMat.dispose();
      scene.remove(lightningGroup);
      clearBolt();
      scene.remove(flash);
    }
  };
}
