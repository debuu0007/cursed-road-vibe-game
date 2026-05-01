import { Howl, Howler } from 'howler';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

const sfx = {};
let engineLoop = null;
let backgroundMusic = null;
let audioBooted = false;

const URLS = {
  engine: '/assets/audio/engine.ogg',
  background: '/assets/audio/background-music.mp3',
  crash: '/assets/audio/crash.ogg',
  oil: '/assets/audio/oil.ogg',
  shock: '/assets/audio/shock.ogg',
  win: '/assets/audio/win.ogg',
  lose: '/assets/audio/lose.ogg'
};

/** Load Howl instances (non-blocking). */
function bootHowls() {
  if (audioBooted) return;
  audioBooted = true;

  engineLoop = new Howl({
    src: [URLS.engine],
    loop: true,
    volume: 0.22,
    html5: true,
    onloaderror() {
      engineLoop = null;
    }
  });

  backgroundMusic = new Howl({
    src: [URLS.background],
    loop: true,
    volume: 0.32,
    html5: true,
    onloaderror() {
      backgroundMusic = null;
    }
  });

  for (const key of ['crash', 'oil', 'shock', 'win', 'lose']) {
    sfx[key] = new Howl({
      src: [URLS[key]],
      volume: key === 'crash' ? 0.45 : 0.38,
      html5: true,
      onloaderror() {
        sfx[key] = null;
      }
    });
  }
}

/** Lazy init after delay (README load strategy). */
export function scheduleAudioInit(delayMs = 6000) {
  window.setTimeout(bootHowls, delayMs);
}

/** Call on first user gesture (autoplay unlock). */
export function unlockAudioPlayback() {
  bootHowls();
  const ctx = Howler.ctx;
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

/**
 * @param {number} speedKmh
 */
export function updateEngineAudio(speedKmh, phase) {
  if (phase !== 'running' || !engineLoop) return;
  try {
    const curve = Math.pow(Math.max(0, speedKmh) / 118, 1.22);
    const rate = clamp(0.38 + curve * 2.05, 0.42, 2.45);
    engineLoop.rate(rate);
    if (!engineLoop.playing()) engineLoop.play();
  } catch {
    // Howl not ready
  }
}

export function stopEngineForMenu() {
  try {
    if (engineLoop && engineLoop.playing()) engineLoop.stop();
    if (backgroundMusic && backgroundMusic.playing()) backgroundMusic.stop();
  } catch {
    // ignore
  }
}

export function startBackgroundMusic() {
  try {
    if (backgroundMusic && !backgroundMusic.playing()) backgroundMusic.play();
  } catch {
    // ignore
  }
}

/** @param {'crash'|'oil'|'shock'|'win'|'lose'} name */
export function playSfx(name) {
  bootHowls();
  const h = sfx[name];
  try {
    if (h && h.state() === 'loaded') h.play();
  } catch {
    // ignore
  }
}
