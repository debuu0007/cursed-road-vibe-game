/** @typedef {{ ctx: CanvasRenderingContext2D, state: object, car: object, phase: string }} HudArgs */

/** @param {string} s @param {number} max */
function clampHudText(s, max) {
  const t = String(s)
    .trim()
    .replace(/[\x00-\x1f]/g, '');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** @param {HudArgs & { modes: Record<string, { name: string, goal: string, durationGoal: number|null }> }} opts */
export function drawHUD(canvasW, canvasH, opts) {
  const { ctx, state, car, modes, phase } = opts;
  ctx.clearRect(0, 0, canvasW, canvasH);
  if (!car) return;

  const speed = Math.round(car.body.velocity.length() * 3.6);

  if (phase === 'running') {
    ctx.save();
    const edge = Math.max(0, Math.min(1, (speed - 25) / 110));
    const vignette = ctx.createRadialGradient(
      canvasW * 0.5,
      canvasH * 0.52,
      Math.max(canvasW, canvasH) * 0.04,
      canvasW * 0.5,
      canvasH * 0.52,
      Math.max(canvasW, canvasH) * 0.78
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${0.04 + edge * 0.42})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
  }

  ctx.save();
  ctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#f2f2ed';
  const modeCfg = modes[state.selectedMode];
  ctx.fillText(modeCfg.name.toUpperCase(), 18, 30);
  if (state.portalUsername && String(state.portalUsername).trim()) {
    ctx.fillStyle = '#8fd4a8';
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(clampHudText(state.portalUsername, 42), 18, 46);
    ctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  }
  ctx.fillStyle = '#a5aaa7';
  const objY = state.portalUsername && String(state.portalUsername).trim() ? 64 : 52;
  const objectiveText = modeCfg.durationGoal
    ? `${Math.max(0, Math.ceil(modeCfg.durationGoal - state.time))}s left / ${Math.round(state.distance)}m`
    : `${Math.round(state.distance)}m / ${modeCfg.goal}`;
  ctx.fillText(objectiveText, 18, objY);

  const cx = 92;
  const cy = canvasH - 80;
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath();
  ctx.arc(cx, cy, 48, Math.PI * 0.8, Math.PI * 2.2);
  ctx.stroke();
  const arcFrac = Math.min(1, Math.pow(speed / 125, 0.95));
  ctx.strokeStyle = speed > 160 ? '#f05343' : '#e6d75b';
  ctx.beginPath();
  ctx.arc(cx, cy, 48, Math.PI * 0.8, Math.PI * (0.8 + arcFrac * 1.4));
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '800 26px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(speed), cx, cy + 5);
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#a5aaa7';
  ctx.fillText('KM/H', cx, cy + 24);

  const barW = Math.min(240, canvasW * 0.36);
  const bx = canvasW - barW - 18;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2f2ed';
  ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('DAMAGE', bx, 30);
  ctx.fillStyle = 'rgba(255,255,255,.13)';
  ctx.fillRect(bx, 40, barW, 12);
  ctx.fillStyle = state.damage > 70 ? '#f05343' : '#e6d75b';
  ctx.fillRect(bx, 40, (barW * state.damage) / 100, 12);
  ctx.fillStyle = '#f2f2ed';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(state.damage)}%`, bx + barW, 30);

  if (phase === 'running') {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(242,242,237,.78)';
    ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('KEYS: W↑ GAS — S↓ BRAKE — A / D STEER (ARROWS OK)', canvasW / 2, canvasH - 52);
  }
  ctx.restore();

  if (phase === 'running' && car.shockTTL > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, car.shockTTL / 4.2);
    ctx.strokeStyle = '#f2f2ed';
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i += 1) {
      const x1 = (i * 97 + state.time * 900) % canvasW;
      const y1 = 80 + ((i * 53) % Math.max(120, canvasH - 180));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 55, y1 + 18);
      ctx.stroke();
    }
    ctx.restore();
  }
}
